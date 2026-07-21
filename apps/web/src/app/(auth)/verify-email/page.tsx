import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Подтверждение email</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <VerifyEmailForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
