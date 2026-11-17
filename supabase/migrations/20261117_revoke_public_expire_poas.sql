-- CRM-9 (فحص 2026-11-17): دالة صيانة definer بقي تنفيذها لـPUBLIC (=X)، فكان المجهول يناديها.
revoke all on function public.expire_stale_poas() from public, anon, authenticated;
