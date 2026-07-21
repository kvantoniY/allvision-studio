import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Восстановление пароля</CardTitle>
        <CardDescription>Пришлём ссылку для сброса пароля на вашу почту.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ForgotPasswordForm />
        <div className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-primary hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
