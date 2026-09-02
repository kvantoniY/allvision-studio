'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  layerSpeed,
  layoutOverlay,
  sceneLayers,
  timelineResolution,
  titleStyleSpec,
  TITLE_FONT_STACK,
  type MediaLayer,
  type SceneLayer,
  type TextLayer,
  type TimelineAspect,
  type TimelineScene,
} from '@allvision/shared';
import { boxToRect, fitMedia, rectToBox, snapRect, type PixelRect, type SnapGuide } from './geometry';
import { useMediaElements, type LoadedMedia } from './useMediaElements';

/**
 * Холст сцены.
 *
 * Здесь пользователь наконец берёт кадр мышью: слои двигаются, тянутся за углы и крутятся.
 * Рисуем теми же числами, что уходят в ffmpeg (доли кадра, вписывание cover/contain,
 * раскладка титра из layoutOverlay), поэтому холст показывает будущий файл, а не «похоже».
 */

export type SceneCanvasProps = {
  scene: TimelineScene;
  aspect: TimelineAspect;
  /** Секунды от начала сцены — для видео-слоёв и окон видимости. */
  sceneTimeSec: number;
  playing: boolean;
  /** Во время проигрывания слои не выделяются: холст превращается в плеер. */
  editable: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChangeLayer: (layerId: string, patch: Partial<MediaLayer> & Partial<TextLayer>) => void;
  /** Слой, ожидающий генерацию: показываем на его месте рамку с прогрессом. */
  generationOverlay?: { layerId: string; progress: number; label: string } | null;
};

export function SceneCanvas({
  scene,
  aspect,
  sceneTimeSec,
  playing,
  editable,
  selectedLayerId,
  onSelectLayer,
  onChangeLayer,
  generationOverlay,
}: SceneCanvasProps) {
  const resolution = timelineResolution(aspect);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const layers = useMemo(() => sceneLayers(scene), [scene]);
  const mediaLayers = useMemo(
    () => layers.filter((layer): layer is MediaLayer => layer.kind === 'media'),
    [layers],
  );
  const elements = useMediaElements(mediaLayers);
  const layerRef = useRef<Konva.Layer | null>(null);

  // Кадр вписывается в доступное место целиком: и по ширине, и по высоте. Считать только
  // по ширине нельзя — вертикальный ролик в широкой колонке уезжал вниз на два экрана.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const availableWidth = node.clientWidth;
      const availableHeight = node.clientHeight;
      let width = availableWidth;
      let height = (width * resolution.height) / resolution.width;
      if (availableHeight > 0 && height > availableHeight) {
        height = availableHeight;
        width = (height * resolution.width) / resolution.height;
      }
      setStageSize({ width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [resolution.height, resolution.width]);

  // Видео-слои держим синхронными с временем сцены.
  useEffect(() => {
    for (const layer of mediaLayers) {
      const media = elements.get(layer.id);
      if (!media?.isVideo) continue;
      const video = media.element as HTMLVideoElement;
      video.muted = layer.muted || !playing;
      video.volume = Math.min(1, layer.volume);
      // Скорость слоя браузер отыгрывает сам, но время в файле всё равно считаем мы:
      // при скорости 2 секунда сцены — это две секунды записи.
      const speed = layerSpeed(layer);
      video.playbackRate = speed;
      const expected = (layer.trimStartSec ?? 0) + sceneTimeSec * speed;
      // Подтягиваем время только при заметном расхождении: браузер не перематывает
      // по кадрам, и постоянная коррекция выглядит как дёрганье.
      if (Math.abs(video.currentTime - expected) > 0.35) {
        video.currentTime = expected;
        // На паузе цикл перерисовки не работает, а Konva рисует кадр из <video> только
        // когда её попросят. Без этого перемотка меняла время, но не картинку.
        if (!playing) video.addEventListener('seeked', () => layerRef.current?.batchDraw(), { once: true });
      }
      if (playing && video.paused) void video.play().catch(() => undefined);
      if (!playing && !video.paused) video.pause();
    }
  }, [mediaLayers, elements, sceneTimeSec, playing]);

  // Пока играет видео, Konva должна перерисовываться каждый кадр.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      layerRef.current?.batchDraw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const visible = (layer: SceneLayer) => {
    const start = layer.startSec ?? 0;
    const end = layer.endSec;
    if (sceneTimeSec < start) return false;
    if (typeof end === 'number' && sceneTimeSec > end) return false;
    return true;
  };

  const otherRects = (layerId: string): PixelRect[] =>
    layers
      .filter((layer) => layer.id !== layerId)
      .map((layer) => boxToRect(layer.box, stageSize.width, stageSize.height));

  if (stageSize.width === 0) {
    return <div ref={containerRef} className="h-full w-full" />;
  }

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center">
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        className="overflow-hidden rounded-xl bg-black"
        onMouseDown={(event) => {
          // Клик по пустому месту снимает выделение — привычное поведение любого редактора.
          if (event.target === event.target.getStage()) onSelectLayer(null);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) onSelectLayer(null);
        }}
      >
        <Layer ref={layerRef}>
          <Rect
            x={0}
            y={0}
            width={stageSize.width}
            height={stageSize.height}
            fill={scene.background ?? '#000000'}
            listening={false}
          />

          {layers.map((layer) =>
            visible(layer) ? (
              <LayerNode
                key={layer.id}
                layer={layer}
                media={layer.kind === 'media' ? elements.get(layer.id) : undefined}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
                frameWidth={resolution.width}
                selected={editable && selectedLayerId === layer.id}
                editable={editable && !layer.locked}
                onSelect={() => onSelectLayer(layer.id)}
                onDragMove={(rect) => {
                  const snapped = snapRect(rect, stageSize.width, stageSize.height, otherRects(layer.id));
                  setGuides(snapped.guides);
                  return snapped.rect;
                }}
                onCommit={(rect, rotation) => {
                  setGuides([]);
                  onChangeLayer(layer.id, {
                    box: rectToBox(rect, stageSize.width, stageSize.height),
                    ...(rotation === undefined ? {} : { rotation }),
                  });
                }}
              />
            ) : null,
          )}

          {/*
            * Пока идёт генерация, слой пустой — и без этой рамки непонятно, куда встанет
            * кадр и происходит ли вообще что-нибудь.
            */}
          {generationOverlay && (() => {
            const target = layers.find((layer) => layer.id === generationOverlay.layerId);
            if (!target) return null;
            const rect = boxToRect(target.box, stageSize.width, stageSize.height);
            const barWidth = Math.max(40, rect.width * 0.7);
            return (
              <Group x={rect.x} y={rect.y} listening={false}>
                <Rect width={rect.width} height={rect.height} fill="rgba(15,10,35,0.72)" cornerRadius={6} />
                <Rect width={rect.width} height={rect.height} stroke="#a78bfa" strokeWidth={2} dash={[8, 6]} cornerRadius={6} />
                <Text
                  text={`${generationOverlay.label}… ${Math.round(generationOverlay.progress)}%`}
                  width={rect.width}
                  y={rect.height / 2 - 22}
                  align="center"
                  fontFamily={TITLE_FONT_STACK}
                  fontSize={Math.max(11, Math.min(18, rect.width / 14))}
                  fill="#ede9fe"
                />
                <Rect
                  x={(rect.width - barWidth) / 2}
                  y={rect.height / 2 + 6}
                  width={barWidth}
                  height={6}
                  cornerRadius={3}
                  fill="rgba(148,163,184,0.35)"
                />
                <Rect
                  x={(rect.width - barWidth) / 2}
                  y={rect.height / 2 + 6}
                  width={Math.max(4, (barWidth * Math.min(100, Math.max(2, generationOverlay.progress))) / 100)}
                  height={6}
                  cornerRadius={3}
                  fill="#a78bfa"
                />
              </Group>
            );
          })()}

          {guides.map((guide, index) => (
            <Line
              key={index}
              points={
                guide.orientation === 'v'
                  ? [guide.position, 0, guide.position, stageSize.height]
                  : [0, guide.position, stageSize.width, guide.position]
              }
              stroke="#f6c445"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

function LayerNode({
  layer,
  media,
  stageWidth,
  stageHeight,
  frameWidth,
  selected,
  editable,
  onSelect,
  onDragMove,
  onCommit,
}: {
  layer: SceneLayer;
  media?: LoadedMedia;
  stageWidth: number;
  stageHeight: number;
  frameWidth: number;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onDragMove: (rect: PixelRect) => PixelRect;
  onCommit: (rect: PixelRect, rotation?: number) => void;
}) {
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const rect = boxToRect(layer.box, stageWidth, stageHeight);

  useEffect(() => {
    if (!selected || !transformerRef.current || !groupRef.current) return;
    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected]);

  const commit = () => {
    const node = groupRef.current;
    if (!node) return;
    // Konva масштабирует узел, а таймлайн хранит размеры: превращаем масштаб в размер,
    // иначе вложенные элементы (текст) поехали бы вместе с рамкой.
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onCommit(
      {
        x: node.x(),
        y: node.y(),
        width: Math.max(4, rect.width * scaleX),
        height: Math.max(4, rect.height * scaleY),
      },
      Math.round(node.rotation()),
    );
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={rect.x}
        y={rect.y}
        rotation={layer.rotation}
        opacity={layer.opacity}
        draggable={editable}
        listening={editable}
        onMouseDown={onSelect}
        onTouchStart={onSelect}
        onDragMove={(event) => {
          const node = event.target;
          const snapped = onDragMove({ x: node.x(), y: node.y(), width: rect.width, height: rect.height });
          node.x(snapped.x);
          node.y(snapped.y);
        }}
        onDragEnd={commit}
        onTransformEnd={commit}
      >
        {layer.kind === 'media' ? (
          <MediaContent layer={layer} media={media} rect={rect} />
        ) : (
          <TextContent layer={layer} rect={rect} frameWidth={frameWidth} stageWidth={stageWidth} />
        )}
      </Group>

      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={false}
          anchorSize={9}
          anchorStroke="#f6c445"
          anchorFill="#0b1020"
          borderStroke="#f6c445"
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 16 || newBox.height < 16 ? oldBox : newBox)}
        />
      )}
    </>
  );
}

function MediaContent({ layer, media, rect }: { layer: MediaLayer; media?: LoadedMedia; rect: PixelRect }) {
  if (layer.source.kind === 'color') {
    return <Rect x={0} y={0} width={rect.width} height={rect.height} fill={layer.source.color ?? '#000000'} />;
  }
  if (!media) {
    // Пока файл грузится — заглушка нужного размера, чтобы раскладка не прыгала.
    return <Rect x={0} y={0} width={rect.width} height={rect.height} fill="#111827" />;
  }

  const fitted = fitMedia(layer, media.width, media.height, { x: 0, y: 0, width: rect.width, height: rect.height });
  return (
    <KonvaImage
      image={media.element}
      x={fitted.draw.x}
      y={fitted.draw.y}
      width={fitted.draw.width}
      height={fitted.draw.height}
      crop={fitted.crop}
    />
  );
}

/**
 * Титр на холсте рисуется по той же раскладке, что уходит в SVG экспорта: те же строки,
 * тот же кегль, то же положение. Рисуем нативным текстом, а не картинкой из SVG, чтобы
 * перетаскивание оставалось плавным.
 */
function TextContent({
  layer,
  rect,
  frameWidth,
  stageWidth,
}: {
  layer: TextLayer;
  rect: PixelRect;
  frameWidth: number;
  stageWidth: number;
}) {
  const spec = titleStyleSpec(layer.style);
  // Раскладку считаем в координатах итогового кадра, затем ужимаем под холст —
  // так перенос строк на экране совпадает с переносом в файле.
  const layout = layoutOverlay(layer, { width: frameWidth, height: (frameWidth * rect.height) / rect.width });
  const scale = stageWidth / frameWidth;

  const fontSize = layout.fontSize * scale;
  const lineHeight = layout.lineHeight * scale;
  const subFontSize = layout.subFontSize * scale;
  const blockHeight = layout.blockHeight * scale;
  const top = Math.max(0, (rect.height - blockHeight) / 2);

  const plateWidth = spec.plate
    ? Math.min(rect.width * 0.98, layout.blockWidth * scale + spec.plate.padX * scale * 2)
    : 0;
  const plateHeight = spec.plate ? blockHeight + spec.plate.padY * scale * 2 : 0;

  let cursor = top;
  const nodes: JSX.Element[] = [];
  layout.lines.forEach((line, index) => {
    nodes.push(
      <Text
        key={`line-${index}`}
        text={line}
        x={0}
        y={cursor}
        width={rect.width}
        align="center"
        fontFamily={TITLE_FONT_STACK}
        fontSize={fontSize}
        fontStyle={`${spec.weight}${spec.italic ? ' italic' : ''}`}
        fill={spec.color}
        shadowColor={spec.shadow ? '#000000' : undefined}
        shadowBlur={spec.shadow ? 6 * scale : 0}
        shadowOpacity={spec.shadow ? 0.75 : 0}
        listening={false}
      />,
    );
    cursor += lineHeight;
  });
  if (layout.subLines.length > 0) {
    cursor += layout.fontSize * 0.35 * scale;
    layout.subLines.forEach((line, index) => {
      nodes.push(
        <Text
          key={`sub-${index}`}
          text={line}
          x={0}
          y={cursor}
          width={rect.width}
          align="center"
          fontFamily={TITLE_FONT_STACK}
          fontSize={subFontSize}
          fontStyle={String(Math.max(400, spec.weight - 200))}
          fill={spec.subColor}
          listening={false}
        />,
      );
      cursor += layout.subLineHeight * scale;
    });
  }

  return (
    <>
      {/* Прозрачная подложка ловит клики: по пустому месту рамки титр тоже должен выделяться. */}
      <Rect x={0} y={0} width={rect.width} height={rect.height} fill="rgba(0,0,0,0.001)" />
      {spec.plate && (
        <Rect
          x={(rect.width - plateWidth) / 2}
          y={top - spec.plate.padY * scale}
          width={plateWidth}
          height={plateHeight}
          cornerRadius={Math.min(spec.plate.radius * scale, plateHeight / 2)}
          fill={spec.plate.fill}
          listening={false}
        />
      )}
      {nodes}
    </>
  );
}
