import {
  createAcademySceneRuntimeState,
  elementBorderRadius,
  elementFillColor,
  elementObjectFit,
  elementTextColor,
  parseAcademyScene,
  resolveAcademySceneElement,
  setSceneInputValue,
  transitionAcademyScene,
  type AcademyScene,
  type AcademySceneElement,
  type AcademySceneRuntimeEffect,
  type AcademySceneRuntimeEvent,
  type AcademySceneRuntimeState,
  type AcademyScenePlayerRole,
} from '@allvision/shared';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type Ticker,
} from 'pixi.js';

export interface PixiScenePlayerOptions {
  host: HTMLElement;
  scene: unknown;
  role?: AcademyScenePlayerRole;
  debugBoundaries?: boolean;
  onStateChange?: (state: AcademySceneRuntimeState) => void;
  onEffect?: (effect: AcademySceneRuntimeEffect) => void;
  /** Локальный пользовательский ввод; programmatic send() сюда не попадает. */
  onEvent?: (event: AcademySceneRuntimeEvent) => void;
  onError?: (error: Error) => void;
}

const IMAGE_ELEMENT_TYPES = new Set([
  'animated-background', 'video', 'foreground', 'image', 'character', 'npc', 'prop',
]);

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function elementSource(element: AcademySceneElement): string | undefined {
  return element.asset?.fileUrl ?? element.content.sourceUrl;
}

function withApiOrigin(source: string): string {
  if (!API_URL || !source.startsWith('/api/')) return source;
  return `${API_URL.replace(/\/+$/, '')}${source}`;
}

/**
 * Императивный PixiJS v8-адаптер. Бизнес-логика остаётся в shared state machine;
 * этот класс только рисует её состояние и переводит pointer/keyboard в события.
 */
export class PixiScenePlayer {
  private readonly scene: AcademyScene;
  private readonly options: PixiScenePlayerOptions;
  private readonly app = new Application();
  private runtime: AcademySceneRuntimeState;
  private role: AcademyScenePlayerRole;
  private root: Container | null = null;
  private displayObjects = new Map<string, Container>();
  private drawRevision = 0;
  private destroyed = false;
  private initialized = false;
  private eventQueue: Promise<void> = Promise.resolve();
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private privateTextures = new Map<string, Texture>();
  // Поля ввода рендерятся как настоящие HTML-инпуты поверх канваса (в WebGL ввода нет),
  // чтобы в уроке они выглядели и работали как поле ввода.
  private overlay: HTMLDivElement | null = null;
  private inputElements = new Map<string, HTMLInputElement>();
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: PixiScenePlayerOptions) {
    this.options = options;
    this.scene = parseAcademyScene(options.scene);
    this.runtime = createAcademySceneRuntimeState(this.scene);
    this.role = options.role ?? 'student';
  }

  get state(): AcademySceneRuntimeState {
    return this.runtime;
  }

  async init(): Promise<void> {
    await this.app.init({
      width: this.scene.viewport.width,
      height: this.scene.viewport.height,
      background: this.scene.viewport.backgroundColor,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    this.initialized = true;
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      this.initialized = false;
      return;
    }

    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.aspectRatio = `${this.scene.viewport.width} / ${this.scene.viewport.height}`;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', `Интерактивная сцена: ${this.scene.title}`);

    // Обёртка: канвас + оверлей HTML-полей ввода, спозиционированный точно по канвасу.
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.lineHeight = '0';
    wrap.appendChild(canvas);
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.inset = '0';
    this.overlay.style.pointerEvents = 'none';
    wrap.appendChild(this.overlay);
    this.options.host.replaceChildren(wrap);

    // Пересчёт позиций инпутов при изменении размера канваса (адаптив/полный экран).
    this.resizeObserver = new ResizeObserver(() => this.positionInputs());
    this.resizeObserver.observe(canvas);

    this.keyHandler = (event) => {
      if (event.key === 'Tab') return;
      this.enqueueLocalEvent({ type: 'key-press', key: event.key, role: this.role });
    };
    canvas.addEventListener('keydown', this.keyHandler);

    await this.draw();
    this.options.onStateChange?.(this.runtime);
    await this.dispatch({ type: 'scene-start', role: this.role });
  }

  setRole(role: AcademyScenePlayerRole): void {
    if (this.role === role) return;
    this.role = role;
    void this.draw().catch((error) => this.reportError(error));
  }

  reset(): void {
    this.runtime = createAcademySceneRuntimeState(this.scene);
    this.options.onStateChange?.(this.runtime);
    void this.draw()
      .then(() => this.dispatch({ type: 'scene-start', role: this.role }))
      .catch((error) => this.reportError(error));
  }

  send(event: Omit<AcademySceneRuntimeEvent, 'role'> & { role?: AcademyScenePlayerRole }): void {
    this.enqueueEvent({ ...event, role: event.role ?? this.role });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.drawRevision += 1;
    if (this.keyHandler) this.app.canvas.removeEventListener('keydown', this.keyHandler);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.inputElements.forEach((el) => el.remove());
    this.inputElements.clear();
    this.overlay = null;
    this.displayObjects.clear();
    this.root = null;
    if (this.initialized) {
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.initialized = false;
    }
    this.privateTextures.forEach((texture) => texture.destroy(true));
    this.privateTextures.clear();
  }

  private reportError(error: unknown): void {
    this.options.onError?.(asError(error));
  }

  private enqueueEvent(event: AcademySceneRuntimeEvent): void {
    this.eventQueue = this.eventQueue
      .then(() => this.dispatch(event))
      .catch((error) => this.reportError(error));
  }

  /**
   * Локальное событие сначала зеркалится хосту, затем ровно один раз применяется здесь.
   * `send()` использует enqueueEvent напрямую, поэтому удалённое событие не создаёт эхо.
   */
  private enqueueLocalEvent(event: AcademySceneRuntimeEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch (error) {
      this.reportError(error);
    }
    this.enqueueEvent(event);
  }

  private async dispatch(event: AcademySceneRuntimeEvent): Promise<void> {
    if (this.destroyed) return;
    const result = transitionAcademyScene(this.scene, this.runtime, event);
    this.runtime = result.state;
    this.options.onStateChange?.(this.runtime);
    await this.draw();
    for (const effect of result.effects) {
      this.handleEffect(effect);
      this.options.onEffect?.(effect);
    }
  }

  private handleEffect(effect: AcademySceneRuntimeEffect): void {
    if (effect.type === 'play-sound') {
      const element = this.scene.layers.flatMap((layer) => layer.elements).find((item) => item.id === effect.elementId);
      const source = element && elementSource(element);
      if (source) {
        if (source.startsWith('tone:')) this.playTone(source.slice(5), element?.content.volume ?? 1);
        else {
          const audio = new Audio(withApiOrigin(source));
          audio.volume = element?.content.volume ?? 1;
          void audio.play().catch(() => undefined);
        }
      }
    }
    if (effect.type === 'play-animation') this.animate(effect.elementId, effect.animation);
  }

  private playTone(name: string, volume: number): void {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = name === 'success' ? 660 : 440;
    gain.gain.setValueAtTime(Math.max(0.001, volume * 0.12), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.32);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.32);
    oscillator.onended = () => { void context.close(); };
  }

  private animate(elementId: string, animation: string): void {
    const target = this.displayObjects.get(elementId);
    if (!target) return;
    const baseX = target.x;
    const baseAlpha = target.alpha;
    const baseScaleX = target.scale.x;
    const baseScaleY = target.scale.y;
    let elapsed = 0;
    const duration = 450;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const progress = Math.min(elapsed / duration, 1);
      const wave = Math.sin(progress * Math.PI);
      if (animation === 'shake') target.x = baseX + Math.sin(progress * Math.PI * 8) * 10;
      else if (animation === 'fade') target.alpha = baseAlpha * progress;
      else target.scale.set(baseScaleX * (1 + wave * 0.08), baseScaleY * (1 + wave * 0.08));
      if (progress >= 1) {
        target.x = baseX;
        target.alpha = baseAlpha;
        target.scale.set(baseScaleX, baseScaleY);
        this.app.ticker.remove(tick);
      }
    };
    this.app.ticker.add(tick);
  }

  private async draw(): Promise<void> {
    const revision = ++this.drawRevision;
    const nextRoot = new Container({ sortableChildren: true, label: `scene:${this.scene.id}` });
    const nextObjects = new Map<string, Container>();
    const visibleInputs: AcademySceneElement[] = [];

    const layers = [...this.scene.layers].sort((left, right) => left.zIndex - right.zIndex);
    for (const layer of layers) {
      if (!layer.visible) continue;
      const layerContainer = new Container({ sortableChildren: true, label: `layer:${layer.id}` });
      layerContainer.zIndex = layer.zIndex;
      const elements = [...layer.elements].sort((left, right) => left.zIndex - right.zIndex);
      const rendered = await Promise.all(elements.map(async (base) => {
        const element = resolveAcademySceneElement(base, this.runtime);
        if (!element.visible || (this.role === 'teacher' && !element.teacherVisible)) return null;
        // Поля ввода — HTML-оверлей, а не Pixi (в WebGL нет ввода).
        if (element.type === 'input') { visibleInputs.push(element); return null; }
        const display = await this.createElement(element);
        display.zIndex = element.zIndex;
        nextObjects.set(element.id, display);
        return display;
      }));
      rendered.forEach((display) => { if (display) layerContainer.addChild(display); });
      nextRoot.addChild(layerContainer);
    }

    if (this.destroyed || revision !== this.drawRevision) {
      nextRoot.destroy({ children: true, texture: false, textureSource: false });
      return;
    }

    const previous = this.root;
    this.app.stage.addChild(nextRoot);
    if (previous) {
      this.app.stage.removeChild(previous);
      previous.destroy({ children: true, texture: false, textureSource: false });
    }
    this.root = nextRoot;
    this.displayObjects = nextObjects;
    this.syncInputs(visibleInputs);
  }

  /** Создаёт/обновляет/удаляет HTML-инпуты поверх канваса по видимым input-элементам. */
  private syncInputs(inputs: AcademySceneElement[]): void {
    if (!this.overlay) return;
    const wanted = new Set(inputs.map((el) => el.id));
    for (const [id, el] of this.inputElements) {
      if (!wanted.has(id)) { el.remove(); this.inputElements.delete(id); }
    }
    const editable = this.role === 'student'; // учитель видит поле, но не печатает за ученика
    for (const element of inputs) {
      let input = this.inputElements.get(element.id);
      if (!input) {
        input = document.createElement('input');
        input.type = 'text';
        input.style.position = 'absolute';
        input.style.boxSizing = 'border-box';
        input.style.pointerEvents = 'auto';
        input.style.outline = 'none';
        input.addEventListener('input', () => {
          this.runtime = setSceneInputValue(this.runtime, element.id, input!.value);
          this.options.onStateChange?.(this.runtime);
        });
        this.overlay.appendChild(input);
        this.inputElements.set(element.id, input);
      }
      const current = this.runtime.variables[element.id];
      if (typeof current === 'string' && input.value !== current) input.value = current;
      input.placeholder = element.content.placeholder ?? 'Ответ…';
      input.disabled = !editable;
      input.dataset.elementId = element.id;
      // Стиль поля — как в редакторе: белый фон, рамка, цвет текста.
      input.style.background = elementFillColor({ type: 'input', style: element.style }) === '#f5f5f4'
        ? '#ffffff'
        : elementFillColor({ type: 'input', style: element.style });
      input.style.color = elementTextColor(element);
      input.style.borderRadius = `${elementBorderRadius(element)}px`;
      input.style.border = `2px solid ${element.style.stroke ?? '#d6d3d1'}`;
      input.style.textAlign = element.style.textAlign ?? 'left';
      input.style.fontFamily = element.style.fontFamily ?? 'Inter, Arial, sans-serif';
      input.style.fontWeight = element.style.fontWeight ?? '600';
    }
    this.positionInputs();
  }

  /** Пересчёт пиксельных позиций инпутов относительно текущего размера канваса. */
  private positionInputs(): void {
    if (!this.overlay || this.inputElements.size === 0) return;
    const scale = this.app.canvas.clientWidth / this.scene.viewport.width;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const byId = new Map(this.scene.layers.flatMap((l) => l.elements).map((e) => [e.id, e]));
    for (const [id, input] of this.inputElements) {
      const base = byId.get(id);
      if (!base) continue;
      const element = resolveAcademySceneElement(base, this.runtime);
      const t = element.transform;
      input.style.left = `${t.x * scale}px`;
      input.style.top = `${t.y * scale}px`;
      input.style.width = `${t.width * scale}px`;
      input.style.height = `${t.height * scale}px`;
      input.style.paddingLeft = `${(element.style.padding ?? 12) * scale}px`;
      input.style.paddingRight = `${(element.style.padding ?? 12) * scale}px`;
      input.style.fontSize = `${(element.style.fontSize ?? 22) * scale}px`;
    }
  }

  private async createElement(element: AcademySceneElement): Promise<Container> {
    const wrapper = new Container({ label: `element:${element.id}` });
    const { transform } = element;
    wrapper.position.set(transform.x, transform.y);
    wrapper.pivot.set(transform.width * transform.anchorX, transform.height * transform.anchorY);
    wrapper.rotation = transform.rotation * Math.PI / 180;
    wrapper.alpha = transform.opacity;
    wrapper.scale.set(transform.scaleX, transform.scaleY);

    if (IMAGE_ELEMENT_TYPES.has(element.type)) await this.addImage(wrapper, element);
    else if (element.type !== 'audio') this.addGraphic(wrapper, element);

    const interactive = element.interactive && (this.role === 'teacher' || element.studentInteractive);
    if (interactive) {
      wrapper.eventMode = 'static';
      wrapper.cursor = 'pointer';
      wrapper.on('pointertap', () => {
        this.enqueueLocalEvent({ type: 'element-click', sourceElementId: element.id, role: this.role });
        if (element.content.correctAnswer !== undefined) {
          const correct = element.content.correctAnswer === true
            || Object.is(element.content.value, element.content.correctAnswer);
          this.enqueueLocalEvent({
            type: correct ? 'answer-correct' : 'answer-incorrect',
            sourceElementId: element.id,
            value: element.content.value,
            correct,
            role: this.role,
          });
        }
      });
    }

    if (element.accessibility) {
      wrapper.accessible = true;
      wrapper.accessibleTitle = element.accessibility.label;
      wrapper.accessibleHint = element.accessibility.description ?? null;
      wrapper.accessibleType = interactive ? 'button' : 'div';
      wrapper.tabIndex = interactive ? 0 : -1;
    }
    return wrapper;
  }

  private async addImage(wrapper: Container, element: AcademySceneElement): Promise<void> {
    const source = elementSource(element);
    if (!source) {
      this.addPlaceholder(wrapper, element, 'Материал не выбран');
      return;
    }
    try {
      const texture = element.asset?.scope === 'child'
        ? await this.loadPrivateTexture(element.asset.assetId, source)
        : await Assets.load<Texture>(withApiOrigin(source));
      const sprite = new Sprite(texture);
      const { width, height } = element.transform;
      const fit = elementObjectFit(element);
      // Вписывание картинки как в редакторе: cover заполняет с обрезкой, contain — целиком.
      if (fit === 'fill') {
        sprite.width = width;
        sprite.height = height;
      } else {
        const tw = texture.width || width;
        const th = texture.height || height;
        const ratio = fit === 'cover' ? Math.max(width / tw, height / th) : Math.min(width / tw, height / th);
        sprite.width = tw * ratio;
        sprite.height = th * ratio;
        sprite.x = (width - sprite.width) / 2;
        sprite.y = (height - sprite.height) / 2;
        if (fit === 'cover') {
          // Обрезаем выступающие края маской по рамке элемента.
          const mask = new Graphics().rect(0, 0, width, height).fill({ color: '#ffffff' });
          wrapper.addChild(mask);
          sprite.mask = mask;
        }
      }
      if (element.style.tint) sprite.tint = element.style.tint;
      wrapper.addChild(sprite);
    } catch {
      this.addPlaceholder(wrapper, element, 'Не удалось загрузить материал');
    }
  }

  private async loadPrivateTexture(assetId: string, source: string): Promise<Texture> {
    const cached = this.privateTextures.get(assetId);
    if (cached) return cached;
    const response = await fetch(withApiOrigin(source), { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`Закрытый материал недоступен (${response.status})`);
    const blobUrl = URL.createObjectURL(await response.blob());
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = blobUrl;
      await image.decode();
      const texture = Texture.from(image);
      if (this.destroyed) {
        texture.destroy(true);
        throw new Error('Плеер уже закрыт');
      }
      this.privateTextures.set(assetId, texture);
      return texture;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  private addPlaceholder(wrapper: Container, element: AcademySceneElement, message: string): void {
    const { width, height } = element.transform;
    const graphic = new Graphics()
      .roundRect(0, 0, width, height, Math.min(18, height / 4))
      .fill({ color: '#e7e5e4' })
      .stroke({ color: '#a8a29e', width: 2 });
    wrapper.addChild(graphic);
    this.addText(wrapper, element, message, '#57534e');
  }

  private addGraphic(wrapper: Container, element: AcademySceneElement): void {
    const { width, height } = element.transform;
    const radius = elementBorderRadius(element);
    // Пустой фон-элемент берёт цвет вьюпорта, чтобы не перекрывать сцену серым.
    const fill = element.type === 'background' && !element.style.fill
      ? this.scene.viewport.backgroundColor
      : elementFillColor(element);
    const graphic = new Graphics();

    if (element.type === 'particles') {
      for (let index = 0; index < 18; index += 1) {
        const x = (index * 71) % width;
        const y = (index * 43) % height;
        graphic.circle(x, y, 3 + (index % 4)).fill({ color: fill, alpha: 0.65 });
      }
    } else if (element.type === 'progress' || element.type === 'indicator') {
      const min = element.content.min ?? 0;
      const max = element.content.max ?? 100;
      const value = typeof element.content.value === 'number' ? element.content.value : min;
      const progress = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
      graphic.roundRect(0, 0, width, height, radius || height / 2).fill({ color: '#e7e5e4' });
      graphic.roundRect(0, 0, width * progress, height, radius || height / 2).fill({ color: fill });
    } else {
      const boundaryType = ['hotspot', 'collision', 'platform'].includes(element.type);
      const alpha = boundaryType && !this.options.debugBoundaries ? 0.001 : 1;
      graphic.roundRect(0, 0, width, height, radius).fill({ color: fill, alpha });
      if ((!boundaryType && element.style.stroke) || (boundaryType && this.options.debugBoundaries)) {
        graphic.stroke({
          color: element.style.stroke ?? '#ef4444',
          width: element.style.strokeWidth ?? 2,
          alpha: boundaryType ? 0.7 : 1,
        });
      }
    }
    wrapper.addChild(graphic);

    const contentText = element.content.text
      ?? (element.type === 'timer' && element.content.durationMs ? `${Math.ceil(element.content.durationMs / 1000)} сек.` : undefined);
    if (contentText) this.addText(wrapper, element, contentText, elementTextColor(element));
  }

  private addText(wrapper: Container, element: AcademySceneElement, value: string, fill: string): void {
    const padding = element.style.padding ?? 16;
    const width = Math.max(1, element.transform.width - padding * 2);
    const label = new Text({
      text: value,
      style: {
        fill,
        fontFamily: element.style.fontFamily ?? 'Inter, Arial, sans-serif',
        fontSize: element.style.fontSize ?? 24,
        fontWeight: element.style.fontWeight ?? '600',
        align: element.style.textAlign ?? 'center',
        wordWrap: true,
        wordWrapWidth: width,
      },
    });
    label.anchor.set(element.style.textAlign === 'left' ? 0 : element.style.textAlign === 'right' ? 1 : 0.5, 0.5);
    label.x = element.style.textAlign === 'left'
      ? padding
      : element.style.textAlign === 'right'
        ? element.transform.width - padding
        : element.transform.width / 2;
    label.y = element.transform.height / 2;
    wrapper.addChild(label);
  }
}
