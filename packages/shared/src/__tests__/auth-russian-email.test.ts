import { forgotPasswordSchema, isRussianEmail, loginSchema, registerSchema } from '../schemas/auth';

describe('Russian email validation', () => {
  it('allows Russian email domains', () => {
    expect(isRussianEmail('user@mail.ru')).toBe(true);
    expect(isRussianEmail('user@bk.ru')).toBe(true);
    expect(isRussianEmail('user@yandex.ru')).toBe(true);
    expect(isRussianEmail('user@ya.ru')).toBe(true);
    expect(isRussianEmail('user@company.ru')).toBe(true);
    expect(isRussianEmail('user@domain.xn--p1ai')).toBe(true);
  });

  it('rejects foreign email domains', () => {
    expect(isRussianEmail('user@gmail.com')).toBe(false);
    expect(isRussianEmail('user@outlook.com')).toBe(false);
    expect(isRussianEmail('user@yahoo.com')).toBe(false);
  });

  it('applies the rule to auth schemas', () => {
    expect(registerSchema.parse({ email: 'USER@MAIL.RU', password: 'password1', name: 'Иван' }).email).toBe(
      'user@mail.ru'
    );
    expect(loginSchema.safeParse({ email: 'user@gmail.com', password: 'password1' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'user@yahoo.com' }).success).toBe(false);
  });
});
