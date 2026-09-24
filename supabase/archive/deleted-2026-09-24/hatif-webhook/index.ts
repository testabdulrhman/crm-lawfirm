// hatif-webhook — يستقبل أحداث المكالمات من هاتف/Voxa ويسجّلها في hatif_calls.
// يربط المكالمة بجهة اتصال موجودة بالرقم (دون إنشاء جديد).
// محمي بـ ?secret= يطابق HATIF_WEBHOOK_SECRET. verify_jwt=false.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SECRET = Deno.env.get('HATIF_WEBHOOK_SECRET') ?? ''
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

function pick(o: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    if (o && o[k] != null && o[k] !== '') return o[k]
  }
  return null
}

function toInt(v: any, def = 0): number {
  if (v == null) return def
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : def
}

// آخر 9 أرقام (للمطابقة بغضّ النظر عن البادئة)
function last9(raw: any): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : d
}

function mapCall(c: Record<string, any>) {
  return {
    hatif_channel_id: pick(c, 'hatif_channel_id', 'channel_id', 'channelId', 'ChannelId'),
    hatif_workspace_id: pick(c, 'hatif_workspace_id', 'workspace_id', 'workspaceId', 'WorkspaceId'),
    status: toInt(pick(c, 'status', 'Status'), 0),
    status_label: pick(c, 'status_label', 'statusLabel', 'StatusLabel'),
    direction: toInt(pick(c, 'direction', 'Direction'), 0),
    direction_label: pick(c, 'direction_label', 'directionLabel', 'DirectionLabel'),
    caller_number: pick(c, 'caller_number', 'callerNumber', 'CallerNumber', 'from', 'From'),
    callee_number: pick(c, 'callee_number', 'calleeNumber', 'CalleeNumber', 'to', 'To'),
    contact_number: pick(c, 'contact_number', 'contactNumber', 'ContactNumber'),
    pickup_time: pick(c, 'pickup_time', 'pickupTime', 'PickupTime', 'answerTime', 'startTime', 'StartTime'),
    hangup_time: pick(c, 'hangup_time', 'hangupTime', 'HangupTime', 'endTime', 'EndTime'),
    call_length: (() => { const v = pick(c, 'call_length', 'callLength', 'duration', 'Duration'); return v == null ? null : String(v) })(),
    handler_name: pick(c, 'handler_name', 'handlerName', 'agent', 'agentName', 'HandlerName'),
    recording_url: pick(c, 'recording_url', 'recordingUrl', 'RecordingUrl', 'recording'),
    transcription_text: pick(c, 'transcription_text', 'transcription', 'transcript', 'transcriptionText'),
    summary: pick(c, 'summary', 'Summary'),
    sentiment: pick(c, 'sentiment', 'Sentiment'),
    sentiment_label: pick(c, 'sentiment_label', 'sentimentLabel', 'SentimentLabel'),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = new URL(req.url)
  const provided = url.searchParams.get('secret') || req.headers.get('x-webhook-secret') || ''
  if (!SECRET || provided !== SECRET) return json({ error: 'unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  const arr: any[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.calls)
      ? body.calls
      : Array.isArray(body?.data)
        ? body.data
        : [body]

  let inserted = 0, matched = 0, skipped = 0
  const samples: any[] = []

  for (const c of arr) {
    const row: any = mapCall(c ?? {})
    const num9 = last9(row.contact_number || row.caller_number)
    if (num9.length === 9) {
      const { data: ct } = await admin
        .from('contacts')
        .select('id, name')
        .or(`phone.ilike.%${num9}%,phone2.ilike.%${num9}%`)
        .limit(1)
      if (ct && ct[0]) {
        row.client_id = ct[0].id
        row.client_name = ct[0].name
        matched++
      }
    }

    if (row.caller_number && row.pickup_time) {
      const { data: dup } = await admin
        .from('hatif_calls')
        .select('id')
        .eq('caller_number', row.caller_number)
        .eq('pickup_time', row.pickup_time)
        .limit(1)
      if (dup && dup[0]) { skipped++; continue }
    }

    const { error } = await admin.from('hatif_calls').insert(row)
    if (error) {
      return json({ ok: false, db_error: error.message, mapped: row, raw_keys: Object.keys(c ?? {}) }, 200)
    }
    inserted++
    if (samples.length < 2) samples.push(row)
  }

  return json({ ok: true, received: arr.length, inserted, matched, skipped, samples })
})
