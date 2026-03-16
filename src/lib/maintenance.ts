/**
 * Maintenance mode utility.
 * Toggle via NEXT_PUBLIC_MAINTENANCE_MODE=true in .env.local
 */
export function isMaintenanceMode(): boolean {
  return process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
}
