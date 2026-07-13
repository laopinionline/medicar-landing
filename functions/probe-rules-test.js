'use strict';
// Rules Test API (motor de Google, el de prod): evalúa la regla de Storage feed/ para un write de admindemo,
// con firestore.get MOCKEADO al doc admin. Si ALLOW → la lógica/CEL es correcta en el motor real → la causa en
// prod es exclusivamente la RESOLUCIÓN LIVE del firestore.get (cross-service), no la regla.
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const PROJECT = 'medicar-sistema';
const UID = '5Yjdq6aoDQXbD1OOgjwYkFxyuJY2';
const rules = fs.readFileSync(__dirname + '/../storage.rules', 'utf8');

const testCase = (label, mockResult, expectation) => ({
  expectation,
  request: {
    auth: { uid: UID, token: {} },
    path: `/b/medicar-sistema.firebasestorage.app/o/feed/__probe__/img.jpg`,
    method: 'create',
    resource: { size: 4, contentType: 'image/jpeg' },
    time: '2026-07-13T22:00:00Z'
  },
  functionMocks: mockResult === undefined ? [] : [{
    function: 'firestore.get',
    args: [{ anyValue: {} }],
    result: { value: mockResult }
  }],
  _label: label
});

(async () => {
  const auth = new GoogleAuth({ keyFile: __dirname + '/../seed/serviceAccountKey.json', scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const cases = [
    testCase('A firestore.get MOCK={data:{roles:[admin]}} → esperado ALLOW', { data: { roles: ['admin'] } }, 'ALLOW'),
    testCase('B firestore.get MOCK={data:{roles:[afiliado]}} → esperado DENY', { data: { roles: ['afiliado'] } }, 'DENY'),
    testCase('C SIN mock de firestore.get (como si no resolviera) → observar', undefined, 'ALLOW'),
  ];
  for (const tc of cases) {
    const body = { source: { files: [{ name: 'storage.rules', content: rules }] }, testSuite: { testCases: [{ expectation: tc.expectation, request: tc.request, functionMocks: tc.functionMocks }] } };
    try {
      const r = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, method: 'POST', data: body });
      const res = (r.data.testResults || [])[0] || {};
      console.log(`\n${tc._label}`);
      console.log('  state:', res.state);
      if (res.debugMessages) res.debugMessages.forEach(m => console.log('  debug:', m));
      if (res.errorPosition) console.log('  errorPosition:', JSON.stringify(res.errorPosition));
      if (res.functionCalls) res.functionCalls.forEach(f => console.log('  functionCall:', f.function, JSON.stringify(f.args)));
    } catch (e) {
      const d = e.response && e.response.data; console.log(`\n${tc._label}\n  API ERROR:`, e.message, d ? JSON.stringify(d).slice(0, 300) : '');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
