// scripts/user-set.ts — create the login user or change its password.
// Interactive (TTY): asks twice without echo. Piped stdin: reads the password once.
import readline from 'node:readline';
import { getDb, closeDb } from '@/lib/db/client';
import { setUserPassword } from '@/lib/auth/users';

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
  const username = process.argv[2];
  if (!username) {
    console.error('uso: user-set <username>');
    process.exit(1);
  }

  let password: string;
  if (process.stdin.isTTY) {
    password = await promptHidden('Senha: ');
    const confirm = await promptHidden('Confirme a senha: ');
    if (password !== confirm) {
      console.error('As senhas não conferem.');
      process.exit(1);
    }
  } else {
    password = await readStdin();
  }

  const result = await setUserPassword(getDb(), username, password);
  closeDb();
  console.log(result.created ? `usuário "${result.username}" criado` : `senha de "${result.username}" atualizada (sessões encerradas)`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
