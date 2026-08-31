import type { StudioRole } from '@gbtt/shared/studio/studioAuth'

export const ADMIN_PATH = '/fitness/classboard'
export const MEMBER_PATH = '/fitness/studioflow'
export const SIGN_IN_PATH = '/signin'

/** Where a role belongs once it has signed in. */
export function homePathForRole(role: StudioRole): string {
  return role === 'member' ? MEMBER_PATH : ADMIN_PATH
}
