export type PaymentConfirmationPayload = {
  confirmationUrl: string;
  confirmationMethod?: 'GET' | 'POST';
  confirmationParams?: Record<string, string>;
};

export function submitPaymentConfirmation(payload: PaymentConfirmationPayload) {
  if (payload.confirmationMethod === 'POST' && payload.confirmationParams && typeof document !== 'undefined') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = payload.confirmationUrl;
    form.style.display = 'none';

    for (const [name, value] of Object.entries(payload.confirmationParams)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
    return;
  }

  window.location.assign(payload.confirmationUrl);
}
