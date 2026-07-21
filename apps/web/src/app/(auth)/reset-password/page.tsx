import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Новый пароль</CardTitle>
        <CardDescription>Придумайте новый пароль для входа в кабинет.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
