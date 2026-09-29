LOJA ROBLOX — versão servidor + PostgreSQL

ARQUIVOS
- server.js
- loja.html
- editor.html
- logo.jpg
- package.json

RENDER
1. Crie um Web Service apontando para este projeto.
2. Build Command: npm install
3. Start Command: npm start
4. Use um PostgreSQL (Render Postgres ou outro compatível) e copie a DATABASE_URL para o Web Service.

VARIÁVEIS DE AMBIENTE
- GOOGLE_CLIENT_ID = ID do cliente OAuth Web do Google
- ADMIN_EMAIL = e-mail Google do dono da loja
- MP_TOKEN = Access Token de produção do Mercado Pago
- STORE_NAME = nome inicial da loja
- DATABASE_URL = URL do PostgreSQL
- MP_PAYOUTS_ENABLED = 0 inicialmente; use 1 somente depois de liberar/testar Payouts na conta Mercado Pago
- MP_PRIVATE_KEY = somente se a configuração de Payouts da sua conta exigir assinatura Ed25519

GOOGLE
No Google Cloud/Google Auth Platform, adicione o endereço HTTPS do Render em Origens JavaScript autorizadas. O login agora é validado no servidor e cria uma sessão HttpOnly.

MERCADO PAGO
O pagamento Pix é criado no servidor. O MP_TOKEN nunca vai para o HTML. O código também usa X-Idempotency-Key para criação de pagamentos.

SAQUE
O editor tem saldo disponível, total vendido, total já resgatado, histórico de saques e formulário de saque por Pix. A opção automática fica bloqueada até MP_PAYOUTS_ENABLED=1.

SEGURANÇA
- Não coloque MP_TOKEN, MP_PRIVATE_KEY ou DATABASE_URL dentro do código ou do GitHub.
- Não envie essas credenciais aqui no chat.
- O editor só libera as rotas administrativas para ADMIN_EMAIL.
- Use HTTPS no Render.

OBSERVAÇÃO
O banco PostgreSQL é necessário para persistência real no Render. Sem DATABASE_URL, o servidor cai para db.json/local e isso não é a opção indicada para produção.
