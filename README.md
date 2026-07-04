# Mail2WhatsApp AI — Production V1

An intelligent email summarization, category classification, and forwarding gateway. Mail2WhatsApp AI automatically monitors your Gmail inbox, analyzes incoming emails using OpenAI/OpenRouter models, extracts critical summaries, and routes urgent alerts directly to your WhatsApp.

---

## 🔑 Environment Variables Configuration

Create a `.env` file in the root directory and configure the following variables (refer to `.env.example`):

```env
# LLM Provider Configuration ('openai' or 'openrouter')
LLM_PROVIDER=openrouter
LLM_API_KEY=your_openai_or_openrouter_api_key
LLM_MODEL=openrouter/free

# Google OAuth Credentials (for Gmail integration)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# JWT Encryption Secret
JWT_SECRET=your_jwt_signing_secret_hex_string

# WhatsApp Cloud API Credentials
WHATSAPP_ACCESS_TOKEN=your_whatsapp_permanent_access_token
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
```

---

## 🛠️ Service Setup Guidelines

### 1. Google OAuth & Gmail API Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project or select an existing one.
3. Enable the **Gmail API** under *APIs & Services > Library*.
4. Configure the OAuth Consent Screen:
   - Select **External** user type.
   - Add the scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and `https://www.googleapis.com/auth/gmail.readonly`.
   - Add your developer email as a test user since the app is in Testing mode.
5. Create credentials under *APIs & Services > Credentials*:
   - Click *Create Credentials > OAuth client ID*.
   - Application type: **Web application**.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback` (for local development).
6. Copy the **Client ID** and **Client Secret** into your `.env` file.

### 2. OpenAI / OpenRouter Setup
- **OpenAI:** Obtain an API key from the [OpenAI Platform](https://platform.openai.com/). Set `LLM_PROVIDER=openai` and specify a model like `gpt-4o-mini`.
- **OpenRouter:** Obtain an API key from [OpenRouter](https://openrouter.ai/). Set `LLM_PROVIDER=openrouter` and use `openrouter/free` for free inference or a paid model slug if you have access.

### 3. WhatsApp Cloud API Setup
1. Log in to the [Meta Developers Portal](https://developers.facebook.com/).
2. Create an App with the **Other** type, then select **Business** portfolio.
3. Add the **WhatsApp** product to your App.
4. Locate the **Temporary Access Token** and **Phone Number ID** under the WhatsApp *Getting Started* tab.
5. Set up a permanent access token by creating a System User in your Meta Business Manager and granting it permission to your WhatsApp account.
6. Populate `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in your `.env` file.

---

## 🚀 Run Locally

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
Starts the Express backend on port `3000` with the Vite frontend assets served dynamically:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 3. Production Build & Run
To compile the frontend and start the server in production mode:
```bash
# Build Vite assets
npm run build

# Start the server (Set NODE_ENV to production)
$env:NODE_ENV="production"
npm start
```
