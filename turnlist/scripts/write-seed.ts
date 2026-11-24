import { writeFileSync } from 'node:fs';
import { seedSql } from './gen-seed';
writeFileSync('supabase/seed.sql', seedSql());
console.log('wrote supabase/seed.sql');
