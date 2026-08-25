import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Подтверждение email</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <VerifyEmailForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
