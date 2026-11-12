// scripts/user-set.ts <email> — change a user's password, or create the user (asks for the name).
// Interactive (TTY): asks twice without echo. Piped stdin: reads the password once.
import readline from 'node:readline';
import { getDb, closeDb } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { createUser, findUserByEmail, setUserPassword } from '@/lib/auth/users';

function promptVisible(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const writable = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    writable._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('uso: user-set <email>');
    process.exit(1);
  }

  const db = getDb();
  const existing = await findUserByEmail(db, email);
  // Piped stdin: first line = password, optional second line = name (new users only).
  let name = '';
  if (!existing && process.stdin.isTTY) name = (await promptVisible('Nome: ')).trim();

  let password: string;
  if (process.stdin.isTTY) {
    password = await promptHidden('Senha: ');
    const confirm = await promptHidden('Confirme a senha: ');
    if (password !== confirm) {
      console.error('As senhas não conferem.');
      process.exit(1);
    }
  } else {
    const lines = (await readStdin()).split(/\r?\n/);
    password = lines[0];
    if (!existing) name = (lines[1] ?? '').trim();
  }

  if (existing) {
    await setUserPassword(db, existing.id, password);
    console.log(`senha de "${existing.email}" atualizada (sessões encerradas)`);
  } else {
    if (!name) {
      console.error('usuário novo: informe o nome (prompt, ou segunda linha do stdin).');
      process.exit(1);
    }
    const anyAdmin = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).get();
    const u = await createUser(db, { email, name, password, role: anyAdmin ? 'member' : 'admin' });
    console.log(`usuário "${u.email}" criado como ${u.role}`);
  }
  closeDb();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
