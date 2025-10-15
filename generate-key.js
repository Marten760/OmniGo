import { generateKeyPairSync } from 'crypto';
import { writeFileSync } from 'fs';

// إنشاء زوج المفاتيح
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'pkcs1',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

// حفظ المفتاح الخاص في ملف .env.local
const envContent = `JWT_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"\n`;
writeFileSync('.env.local', envContent, { flag: 'a' });

console.log('✅ تم إنشاء المفتاح وإضافته إلى .env.local');
console.log('🔑 المفتاح الخاص:');
console.log(privateKey);