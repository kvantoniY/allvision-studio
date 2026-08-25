import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <div className="text-sm text-muted-foreground text-center">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="hover:underline">
            Войти
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
