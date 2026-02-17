export type JwtPayload = {
  sub: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_MANAGER' | 'EMPLOYEE';
  tenantId: string | null;
};
