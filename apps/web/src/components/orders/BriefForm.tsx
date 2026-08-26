'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { validateBriefValues, type BriefField } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useCreateOrderMutation, type PublicOrderType } from '@/store/api/orders-api';

/**
 * Форма брифа. Поля приходят из типа заказа, настроенного в админке, — здесь нет
 * ни одного захардкоженного вопроса, иначе новый формат заказа требовал бы релиза.
 */
export function BriefForm({ orderType }: { orderType: PublicOrderType }) {
  const router = useRouter();
  const { data: me } = useGetMeQuery();
  const [createOrder, { isLoading }] = useCreateOrderMutation();

  const [values, setValues] = useState<Record<string, string>>({});
  const [contactName, setContactName] = useState(me?.user?.name ?? '');
  const [contactEmail, setContactEmail] = useState(me?.user?.email ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [touched, setTouched] = useState(false);

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
