'use client';

import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import type { ContactInput } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useSendContactMutation } from '@/store/api/public-api';

const initialForm: ContactInput = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

export function ContactForm() {
  const [form, setForm] = useState<ContactInput>(initialForm);
  const [sendContact, { isLoading }] = useSendContactMutation();
  const { toast } = useToast();

  const update = (field: keyof ContactInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await sendContact(form).unwrap();
      setForm(initialForm);
      toast({
        title: 'Мы получили ваше сообщение',
        description: 'Ответим в течение 24 часов.',
      });
    } catch {
      toast({
        title: 'Не удалось отправить сообщение',
        description: 'Проверьте поля формы или напишите напрямую в Telegram.',
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border bg-card p-6 dark:border-slate-800">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Имя</Label>
          <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} required minLength={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">Тема</Label>
        <Input id="subject" value={form.subject} onChange={(e) => update('subject', e.target.value)} required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Сообщение</Label>
        <Textarea id="message" value={form.message} onChange={(e) => update('message', e.target.value)} required minLength={10} rows={7} />
      </div>
      <Button type="submit" disabled={isLoading} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
        <Send className="h-4 w-4" />
        {isLoading ? 'Отправляем...' : 'Отправить'}
      </Button>
    </form>
  );
}
