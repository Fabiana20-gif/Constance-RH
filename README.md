# 🚀 Sistema RH Constance — Guia de Deploy

Tempo estimado: **15–20 minutos** · Custo: **Gratuito**

---

## O que você vai precisar (tudo gratuito)

- Conta Google (para o Firebase)
- Conta no GitHub: github.com
- Conta no Vercel: vercel.com

---

## PASSO 1 — Criar o banco de dados (Firebase)

1. Acesse **console.firebase.google.com**
2. Clique em **"Criar um projeto"**
3. Nome do projeto: `constance-rh` → Avançar → Criar projeto
4. No menu lateral, clique em **Firestore Database** → **Criar banco de dados**
5. Escolha **Modo de produção** → Selecione região `southamerica-east1` → Ativar
6. No menu lateral, clique em **Configurações do projeto** (ícone de engrenagem)
7. Em "Seus aplicativos", clique em **`</>`** (adicionar app web)
8. Nome: `constance-rh-web` → Registrar app
9. **COPIE** todo o bloco `firebaseConfig` que aparece — você vai precisar desses valores

### Configurar permissões do banco
No menu **Firestore Database** → aba **Regras**, substitua o conteúdo por:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /responses/{document} {
      allow read, write: if true;
    }
  }
}
```
Clique em **Publicar**.

---

## PASSO 2 — Subir o projeto no GitHub

1. Acesse **github.com** e faça login
2. Clique em **"New repository"** (botão verde)
3. Nome: `constance-rh` → **Create repository**
4. Na página do repositório vazio, clique em **"uploading an existing file"**
5. Arraste **todos os arquivos desta pasta** (incluindo a pasta `src/` e `api/`)
6. Clique em **Commit changes**

---

## PASSO 3 — Deploy no Vercel

1. Acesse **vercel.com** e faça login com sua conta GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `constance-rh`
4. Clique em **Deploy** (as configurações já estão corretas)
5. Quando o deploy terminar, vá em **Settings → Environment Variables**
6. Adicione as seguintes variáveis (valores do Firebase do Passo 1):

| Nome da variável | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | valor do `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | valor do `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | valor do `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | valor do `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | valor do `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | valor do `appId` |
| `ANTHROPIC_API_KEY` | sua chave da Anthropic (console.anthropic.com) |

7. Após adicionar as variáveis, vá em **Deployments** → clique nos 3 pontinhos → **Redeploy**

---

## PASSO 4 — Seu sistema está no ar! 🎉

O Vercel vai te dar um link tipo:
`https://constance-rh.vercel.app`

- **Colaboradores** acessam esse link para responder o formulário
- **RH/Gestão** acessa o mesmo link e clica em "Dashboard RH"
- Os dados aparecem em **tempo real** no dashboard

### Personalizar o domínio (opcional)
No Vercel, em **Settings → Domains**, você pode adicionar um domínio próprio
como `rh.constance.com.br` se tiver um domínio cadastrado.

---

## Acessar os dados brutos

Para ver todos os dados diretamente:
1. Acesse **console.firebase.google.com**
2. Selecione seu projeto → **Firestore Database**
3. Clique na coleção `responses`
4. Você verá todos os formulários respondidos

Para exportar do Firebase:
- Use o botão **"Exportar Excel/CSV"** no próprio dashboard do sistema

---

## Limites do plano gratuito

| Recurso | Limite gratuito |
|---|---|
| Leituras Firestore | 50.000/dia |
| Escritas Firestore | 20.000/dia |
| Armazenamento | 1 GB |
| Hospedagem Vercel | Ilimitada |

Para uma empresa com ~100 desligamentos/mês, esses limites são mais que suficientes.

---

## Dúvidas?

Se travar em algum passo, peça ajuda ao Claude com o erro exato que apareceu. 😊
