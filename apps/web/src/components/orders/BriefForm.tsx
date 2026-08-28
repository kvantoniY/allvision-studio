'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Send, X } from 'lucide-react';
import {
  ORDER_CONTACT_CHANNELS,
  ORDER_CONTACT_CHANNEL_TITLES,
  validateBriefValues,
  type BriefField,
  type OrderContactChannel,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useGetMeQuery } from '@/store/api/auth-api';
import {
  useCreateOrderMutation,
  useUploadOrderAttachmentMutation,
  type PublicOrderType,
} from '@/store/api/orders-api';
import { cn } from '@/lib/utils';

/**
 * Форма брифа. Поля приходят из типа заказа, настроенного в админке, — здесь нет
 * ни одного захардкоженного вопроса, иначе новый формат заказа требовал бы релиза.
 */
export function BriefForm({ orderType }: { orderType: PublicOrderType }) {
  const router = useRouter();
  const { data: me } = useGetMeQuery();
  const [createOrder, { isLoading }] = useCreateOrderMutation();

  const [values, setValues] = useState<Record<string, string>>({});
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [channel, setChannel] = useState<OrderContactChannel | null>(null);
  const [handle, setHandle] = useState('');
  const [uploadAttachment, uploadState] = useUploadOrderAttachmentMutation();

  // Профиль обычно догружается уже после первого рендера, поэтому подставляем контакты
  // эффектом: иначе поля так и остались бы пустыми и человек заполнял бы их вручную.
  // Введённое пользователем не трогаем.
  useEffect(() => {
    if (!me?.user) return;
    setContactName((current) => current || me.user.name || '');
    setContactEmail((current) => current || me.user.email || '');
  }, [me?.user]);

  const issues = useMemo(() => validateBriefValues(orderType.briefFields, values), [orderType.briefFields, values]);
  const issueFor = (fieldId: string) => issues.find((issue) => issue.fieldId === fieldId)?.message;

  const submit = async () => {
    setTouched(true);
    if (issues.length > 0) {
      toast({ title: issues[0].message, variant: 'destructive' });
      return;
    }
    if (!contactName.trim() || !contactEmail.trim()) {
      toast({ title: 'Укажите имя и почту для связи', variant: 'destructive' });
      return;
    }
    try {
      const result = await createOrder({
        typeSlug: orderType.slug,
        brief: values,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        attachments,
        contactMessenger: channel ?? undefined,
        contactHandle: channel ? handle.trim() || undefined : undefined,
      }).unwrap();
      toast({
        title: 'Заявка отправлена',
        description: 'Мы напишем на почту — уточним детали и назовём цену.',
      });
      router.push(`/orders/${result.order.id}`);
    } catch (error) {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось отправить заявку', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {orderType.briefFields.map((field) => (
        <BriefFieldControl
          key={field.id}
          field={field}
          value={values[field.id] ?? ''}
          error={touched ? issueFor(field.id) : undefined}
          onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))}
        />
      ))}

      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Как с вами связаться</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="order-name">Имя *</Label>
            <Input id="order-name" value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-email">Email *</Label>
            <Input
              id="order-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="order-phone">Телефон или мессенджер (необязательно)</Label>
          <Input
            id="order-phone"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            maxLength={40}
            placeholder="+7 900 000-00-00"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Исходники и референсы</h3>
        <p className="text-xs text-slate-500">
          Фотографии, из которых собирать ролик, и пример, на который хочется ориентироваться.
          Можно приложить позже — менеджер напомнит.
        </p>
        <div className="flex flex-wrap gap-2">
          {attachments.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item !== url))}
                aria-label="Убрать файл"
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-slate-950/80 text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-700 text-slate-500 transition hover:border-slate-500">
            {uploadState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  const result = await uploadAttachment(file).unwrap();
                  setAttachments((current) => [...current, result.url]);
                } catch {
                  toast({ title: 'Не удалось загрузить файл', variant: 'destructive' });
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Где вам удобнее общаться</h3>
        <p className="text-xs text-slate-500">
          По умолчанию пишем на почту. Если удобнее мессенджер — выберите его и оставьте ник или номер,
          менеджер напишет первым.
        </p>
        <div className="flex flex-wrap gap-2">
          {ORDER_CONTACT_CHANNELS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setChannel((current) => (current === item ? null : item))}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition',
                channel === item
                  ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500',
              )}
            >
              {ORDER_CONTACT_CHANNEL_TITLES[item]}
            </button>
          ))}
        </div>
        {channel && (
          <div className="space-y-2">
            <Label htmlFor="order-handle">Ник или номер в {ORDER_CONTACT_CHANNEL_TITLES[channel]}</Label>
            <Input
              id="order-handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              maxLength={120}
              placeholder={channel === 'telegram' ? '@username' : '+7 900 000-00-00'}
            />
          </div>
        )}
      </div>

      <Button type="button" onClick={submit} disabled={isLoading} className="w-full sm:w-auto">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Отправить заявку
      </Button>
      <p className="text-xs text-slate-500">
        Отправка заявки ничего не списывает. Оплата — после того, как мы назовём цену и вы её подтвердите.
      </p>
    </div>
  );
}

function BriefFieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: BriefField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const label = (
    <Label htmlFor={`brief-${field.id}`}>
      {field.label} {field.required && <span className="text-amber-300">*</span>}
    </Label>
  );

  return (
    <div className="space-y-2">
      {label}
      {field.type === 'textarea' ? (
        <Textarea
          id={`brief-${field.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={field.maxLength ?? 2000}
          rows={4}
          placeholder={field.placeholder}
        />
      ) : field.type === 'select' ? (
        <select
          id={`brief-${field.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
        >
          <option value="">Не выбрано</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`brief-${field.id}`}
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={field.maxLength ?? 200}
          placeholder={field.placeholder}
        />
      )}
      {field.hint && <p className="text-xs text-slate-500">{field.hint}</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
