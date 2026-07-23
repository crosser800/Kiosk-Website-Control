import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CreateAdminRequest = {
  full_name?: string;
  fullName?: string;
  email?: string;
  role?: string | null;
  status?: string | null;
  contact_number?: string | null;
  contactNumber?: string | null;
  department_id?: string | null;
  departmentId?: string | null;
  department_name?: string | null;
  departmentName?: string | null;
  access?: unknown;
  profile_image_url?: string | null;
  profileImageUrl?: string | null;
};

type RequesterAdmin = {
  role: string | null;
  status: string | null;
  is_system_owner: boolean | null;
};

type CreatedAdmin = {
  id: string;
};

type AdminRole = {
  id: string;
  role_name: string | null;
};

type AdminDepartment = {
  id: string;
  name: string | null;
  is_active: boolean | null;
};

const allowedStatuses = new Set(['Active', 'Inactive', 'Blocked']);
const allowedRoleNames = new Set(['admin', 'super_admin', 'developer']);
const allowedAccessLabels = new Set(['Products', 'Order', 'Sales', 'Accounts', 'Settings']);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(
  status: number,
  error: string,
  code: string,
  details?: string,
) {
  return jsonResponse(status, { error, code, ...(details ? { details } : {}) });
}

function logStep(step: string, context: Record<string, unknown> = {}) {
  console.info('create-admin-account', { step, ...context });
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeStatus(value: unknown) {
  const text = cleanText(value);
  if (!text) return 'Active';

  const lowered = text.toLowerCase();
  if (lowered === 'active') return 'Active';
  if (lowered === 'inactive') return 'Inactive';
  if (lowered === 'blocked') return 'Blocked';
  return text;
}

function normalizeRole(value: unknown) {
  const role = cleanText(value) || 'admin';
  return role.toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeAccess(value: unknown) {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

function isAllowedRequester(admin: RequesterAdmin | null) {
  if (!admin || admin.status !== 'Active') {
    return false;
  }

  if (admin.is_system_owner) {
    return true;
  }

  return ['admin', 'super_admin', 'developer', 'system_owner'].includes(
    String(admin.role ?? '').toLowerCase(),
  );
}

async function cleanUpCreatedAdmin(adminClient: ReturnType<typeof createClient>, adminId: string) {
  const { error: roleCleanupError } = await adminClient
    .from('admin_account_roles')
    .delete()
    .eq('admin_account_id', adminId);

  const { error: adminCleanupError } = await adminClient
    .from('admin_accounts')
    .delete()
    .eq('id', adminId);

  logStep('cleanup result', {
    roleLinkDeleted: !roleCleanupError,
    adminDeleted: !adminCleanupError,
    roleCleanupCode: roleCleanupError?.code,
    adminCleanupCode: adminCleanupError?.code,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed.', 'METHOD_NOT_ALLOWED');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse(
      500,
      'Admin account service is not configured.',
      'SERVICE_NOT_CONFIGURED',
    );
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const requesterJwt = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!requesterJwt) {
    return errorResponse(401, 'Missing admin authorization.', 'MISSING_AUTHORIZATION');
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data: requester, error: requesterError } = await adminClient.auth.getUser(requesterJwt);

    if (requesterError || !requester.user) {
      logStep('requester authorization result', {
        authorized: false,
        reason: 'invalid requester jwt',
        code: requesterError?.name,
      });
      return errorResponse(401, 'Invalid admin authorization.', 'INVALID_AUTHORIZATION');
    }

    const { data: requesterAdmin, error: adminError } = await adminClient
      .from('admin_accounts')
      .select('role, status, is_system_owner')
      .eq('auth_user_id', requester.user.id)
      .maybeSingle<RequesterAdmin>();

    if (adminError) {
      console.error('create-admin-account requester lookup failed', {
        code: adminError.code,
      });
      return errorResponse(
        500,
        'Unable to verify admin authorization.',
        'REQUESTER_LOOKUP_FAILED',
      );
    }

    const requesterAuthorized = isAllowedRequester(requesterAdmin);
    logStep('requester authorization result', {
      authorized: requesterAuthorized,
      status: requesterAdmin?.status ?? null,
      role: requesterAdmin?.role ?? null,
      isSystemOwner: Boolean(requesterAdmin?.is_system_owner),
    });

    if (!requesterAuthorized) {
      return errorResponse(
        403,
        'Your account is not authorized to create administrators.',
        'REQUESTER_NOT_AUTHORIZED',
      );
    }

    const payload = (await request.json().catch(() => ({}))) as CreateAdminRequest;
    const fullName = cleanText(payload.full_name ?? payload.fullName);
    const email = cleanText(payload.email).toLowerCase();
    const status = normalizeStatus(payload.status);
    const roleName = normalizeRole(payload.role);
    const departmentId = cleanText(payload.department_id ?? payload.departmentId);
    const access = normalizeAccess(payload.access);

    logStep('normalized payload', {
      email,
      selectedRole: roleName,
      selectedDepartmentProvided: Boolean(departmentId),
      accessCount: Array.isArray(access) ? access.length : null,
    });

    if (!fullName) {
      return errorResponse(400, 'Full name is required.', 'FULL_NAME_REQUIRED');
    }

    if (!email || !isValidEmail(email)) {
      return errorResponse(400, 'A valid email address is required.', 'INVALID_EMAIL');
    }

    if (!allowedStatuses.has(status)) {
      return errorResponse(400, 'Invalid admin account status.', 'INVALID_STATUS');
    }

    if (!allowedRoleNames.has(roleName)) {
      return errorResponse(400, 'The selected role is unavailable.', 'INVALID_ROLE');
    }

    if (!departmentId || !isUuid(departmentId)) {
      return errorResponse(400, 'Please select a valid department.', 'INVALID_DEPARTMENT');
    }

    if (!Array.isArray(access)) {
      return errorResponse(400, 'Invalid access selection.', 'INVALID_ACCESS');
    }

    const invalidAccess = access.filter((item) => !allowedAccessLabels.has(item));
    if (invalidAccess.length > 0) {
      return errorResponse(400, 'Invalid access selection.', 'INVALID_ACCESS');
    }

    const { data: existingAdmin, error: existingAdminError } = await adminClient
      .from('admin_accounts')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingAdminError) {
      console.error('create-admin-account duplicate lookup failed', {
        code: existingAdminError.code,
      });
      return errorResponse(
        500,
        'Unable to validate this admin email.',
        'EMAIL_LOOKUP_FAILED',
      );
    }

    if (existingAdmin) {
      return errorResponse(
        409,
        'An administrator with this email already exists.',
        'DUPLICATE_ADMIN_EMAIL',
      );
    }

    const { data: department, error: departmentError } = await adminClient
      .from('admin_departments')
      .select('id, name, is_active')
      .eq('id', departmentId)
      .maybeSingle<AdminDepartment>();

    logStep('department lookup result', {
      found: Boolean(department),
      active: Boolean(department?.is_active),
      code: departmentError?.code,
    });

    if (departmentError) {
      console.error('create-admin-account department lookup failed', {
        code: departmentError.code,
      });
      return errorResponse(
        500,
        'Unable to validate the selected department.',
        'DEPARTMENT_LOOKUP_FAILED',
      );
    }

    if (!department || !department.is_active || !cleanText(department.name)) {
      return errorResponse(400, 'Please select a valid department.', 'INVALID_DEPARTMENT');
    }

    const { data: roles, error: roleError } = await adminClient
      .from('admin_roles')
      .select('id, role_name')
      .limit(100);

    const role = ((roles ?? []) as AdminRole[]).find(
      (candidateRole) => normalizeRole(candidateRole.role_name) === roleName,
    );

    logStep('selected role lookup result', {
      selectedRole: roleName,
      found: Boolean(role?.id),
      code: roleError?.code,
    });

    if (roleError || !role?.id) {
      console.error('create-admin-account role lookup failed', {
        roleName,
        code: roleError?.code,
      });
      return errorResponse(400, 'The selected role is unavailable.', 'ROLE_UNAVAILABLE');
    }

    const departmentName = cleanText(department.name);
    const accessText = access.join(', ');

    const { data: createdAdmin, error: insertError } = await adminClient
      .from('admin_accounts')
      .insert({
        auth_user_id: null,
        full_name: fullName,
        email,
        contact_number: cleanNullableText(payload.contact_number ?? payload.contactNumber),
        position: accessText || null,
        department_id: department.id,
        department: departmentName,
        status,
        profile_image_url: cleanNullableText(
          payload.profile_image_url ?? payload.profileImageUrl,
        ),
        role: roleName,
        is_system_owner: false,
      })
      .select('id')
      .maybeSingle<CreatedAdmin>();

    logStep('admin insert result', {
      inserted: Boolean(createdAdmin?.id),
      authUserIdState: 'null',
      code: insertError?.code,
    });

    if (insertError || !createdAdmin) {
      console.error('create-admin-account admin insert failed', {
        code: insertError?.code,
      });
      return errorResponse(
        500,
        'The administrator account could not be created.',
        'ADMIN_INSERT_FAILED',
      );
    }

    const { error: roleLinkError } = await adminClient
      .from('admin_account_roles')
      .insert({
        admin_account_id: createdAdmin.id,
        admin_role_id: role.id,
      });

    logStep('role-link insert result', {
      inserted: !roleLinkError,
      selectedRole: roleName,
      code: roleLinkError?.code,
    });

    if (roleLinkError) {
      console.error('create-admin-account role link failed', {
        code: roleLinkError.code,
      });
      await cleanUpCreatedAdmin(adminClient, createdAdmin.id);
      return errorResponse(
        500,
        'The administrator account could not be created.',
        'ROLE_LINK_INSERT_FAILED',
        'The profile was not kept because role assignment failed.',
      );
    }

    logStep('access insert result', {
      storedAs: 'admin_accounts.position',
      accessCount: access.length,
      inserted: true,
    });

    return jsonResponse(200, {
      ok: true,
      admin_id: createdAdmin.id,
    });
  } catch (error) {
    console.error('create-admin-account unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return errorResponse(
      500,
      'The administrator account could not be created.',
      'UNEXPECTED_FAILURE',
    );
  }
});
