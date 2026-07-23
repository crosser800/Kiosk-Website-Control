import { supabase } from '../lib/supabase';

export type LoginMethod = 'password' | 'activation' | 'unavailable';
export type LoginResolution =
  | { method: 'password' }
  | { method: 'activation' }
  | { method: 'unavailable'; reason?: 'not_found' | 'inactive' };

type ResolveResponse = {
  method?: LoginMethod;
  reason?: 'not_found' | 'inactive';
  error?: string;
};

type FunctionResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type FunctionErrorWithContext = {
  name?: string;
  message?: string;
  status?: number;
  context?: unknown;
};

export function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidLoginEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeLoginEmail(email));
}

export function getMaskedEmail(email: string) {
  const normalized = normalizeLoginEmail(email);
  const [name = '', domain = ''] = normalized.split('@');
  if (!name || !domain) return normalized;

  const visibleName =
    name.length <= 2 ? `${name.charAt(0)}*` : `${name.slice(0, 2)}${'*'.repeat(Math.min(name.length - 2, 4))}`;
  return `${visibleName}@${domain}`;
}

export function validateAdminPassword(password: string) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    notDefault: password.toLowerCase() !== 'password',
  };

  return {
    checks,
    isValid: Object.values(checks).every(Boolean),
  };
}

export async function resolveAdminLoginMethod(email: string): Promise<LoginResolution> {
  const { data, error } = await supabase.functions.invoke<ResolveResponse>(
    'resolve-admin-login-method',
    {
      body: { email: normalizeLoginEmail(email) },
    },
  );

  if (error) {
    throw new Error('Unable to verify this account right now.');
  }

  if (data?.method === 'password') {
    return { method: 'password' };
  }

  if (data?.method === 'activation') {
    return { method: 'activation' };
  }

  return { method: 'unavailable', reason: data?.reason };
}

export async function startAdminActivation(email: string) {
  const normalizedEmail = normalizeLoginEmail(email);
  const { data, error } = await supabase.functions.invoke<FunctionResponse>(
    'start-admin-activation',
    {
      body: { email: normalizedEmail },
    },
  );

  if (error || !data?.ok) {
    if (import.meta.env.DEV) {
      console.error('[admin-activation] eligibility/precreate failed', {
        functionError: error?.message,
        responseError: data?.error,
      });
    }
    throw new Error(data?.error ?? 'This account is unavailable or the email could not be verified.');
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (import.meta.env.DEV) {
    console.info('[admin-activation] otp request result', {
      ok: !otpError,
      code: otpError?.code,
      message: otpError?.message,
      status: otpError?.status,
    });
  }

  if (otpError) {
    throw new Error('Unable to send the verification code.');
  }
}

export async function verifyAdminActivationOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeLoginEmail(email),
    token: token.trim(),
    type: 'email',
  });

  if (error || !data.user) {
    throw new Error('The verification code is invalid or has expired.');
  }
}

export async function completeAdminActivation(password: string) {
  const { error: passwordError } = await supabase.auth.updateUser({ password });

  if (passwordError) {
    throw new Error('Unable to set your password. Please try again.');
  }

  const { data, error } = await supabase.functions.invoke<FunctionResponse>(
    'complete-admin-activation',
  );

  if (error || !data?.ok) {
    if (import.meta.env.DEV) {
      const responseBody = await readFunctionErrorResponse(error);
      console.error('[admin-activation] completion failed', {
        status: getFunctionErrorStatus(error),
        code: data?.code ?? responseBody?.code ?? null,
        message: data?.message ?? data?.error ?? responseBody?.message ?? responseBody?.error ?? error?.message ?? null,
        details: data?.details ?? responseBody?.details ?? null,
        hint: data?.hint ?? responseBody?.hint ?? null,
        responseBody,
      });
    }

    throw new Error(
      data?.error ??
        'Your password was set, but the admin account could not be linked. Please retry activation.',
    );
  }
}

async function readFunctionErrorResponse(error: unknown): Promise<FunctionResponse | null> {
  const context = (error as FunctionErrorWithContext | null)?.context;
  if (!(context instanceof Response)) {
    return null;
  }

  const responseText = await context.clone().text().catch(() => '');
  if (!responseText) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText) as FunctionResponse;
    return parsed && typeof parsed === 'object' ? parsed : { error: responseText };
  } catch {
    return { error: responseText };
  }
}

function getFunctionErrorStatus(error: unknown) {
  const functionError = error as FunctionErrorWithContext | null;
  const context = functionError?.context;
  if (context instanceof Response) {
    return context.status;
  }
  return functionError?.status ?? null;
}
