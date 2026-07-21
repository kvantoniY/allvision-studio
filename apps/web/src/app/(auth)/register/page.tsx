import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Создать аккаунт</CardTitle>
        <CardDescription>
          Родительский аккаунт: профили детей, согласия, запись на уроки и отчёты.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <div className="text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
