/**
 * One-off data copy: duplicate night_slot_tasks from Friday 2026-05-22
 * to Saturday 2026-05-23, excluding the two sweeper tasks.
 *
 * Run with: npx tsx scripts/copy-tasks-friday-to-saturday.ts
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const FRIDAY_NIGHT_ID = 'b6103d83-963f-49e3-a7b0-b6d180733ac1';
const SATURDAY_NIGHT_ID = '2511439b-fe63-478e-9cc5-ba51aef0ad9e';

// The two sweeper tasks to SKIP
const SWEEPER_LABELS = ['Sweep 9/10/SR', 'Sweeper 5 / 8 / HL'];

async function main() {
  console.log('Fetching tasks from Friday 2026-05-22...');

  const { data: sourceTasks, error: fetchErr } = await supabase
    .from('night_slot_tasks')
    .select('slot_key, slot_type, rr_side, task_label, catalog_task_id, sort_order, color')
    .eq('night_id', FRIDAY_NIGHT_ID);

  if (fetchErr) {
    throw new Error(`Failed to fetch Friday tasks: ${fetchErr.message}`);
  }

  console.log(`Found ${sourceTasks?.length ?? 0} tasks on Friday.`);

  const toCopy = (sourceTasks ?? []).filter(
    (t) => !SWEEPER_LABELS.includes(t.task_label)
  );

  console.log(`Will copy ${toCopy.length} tasks (excluded ${SWEEPER_LABELS.length} sweeper tasks).`);

  let inserted = 0;
  let skipped = 0;

  for (const task of toCopy) {
    const { error: insErr } = await supabase.from('night_slot_tasks').insert({
      night_id: SATURDAY_NIGHT_ID,
      slot_key: task.slot_key,
      slot_type: task.slot_type,
      rr_side: task.rr_side,
      task_label: task.task_label,
      catalog_task_id: task.catalog_task_id,
      sort_order: task.sort_order,
      color: task.color,
    });

    if (insErr) {
      if ((insErr as any).code === '23505') {
        skipped++;
        // duplicate — already exists on Saturday, fine
      } else {
        console.error('Insert error for', task.task_label, insErr);
      }
    } else {
      inserted++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Already existed (skipped): ${skipped}`);
  console.log(`  Total copied (excluding sweepers): ${toCopy.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
