import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
dotenv.config();

export interface LLMResult {
  category: string;
  importance: 'High' | 'Medium' | 'Low';
  summary: string;
  aiMetadata?: {
    actionRequired: boolean;
    actionDetails: string | null;
    deadline: string | null;
    classifications: string[];
    spamScore: number;
    calendarEvent: {
      title: string;
      start: string;
      end: string;
    } | null;
  } | null;
}

const OPENROUTER_FALLBACK_MODELS = [
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3-8b-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-3-medium-128k-instruct:free'
];

export async function analyzeEmail(
  from: string,
  subject: string,
  content: string,
  language = 'English',
  customProvider?: string,
  customModel?: string
): Promise<LLMResult> {
  const provider = customProvider || process.env.LLM_PROVIDER || 'openrouter';
  const apiKey = process.env.LLM_API_KEY;
  const initialModel = customModel || process.env.LLM_MODEL || (
    provider === 'openai' ? 'gpt-4o-mini' :
    (provider === 'google' || provider === 'gemini') ? 'gemini-1.5-flash' :
    'openrouter/free'
  );

  if (!apiKey || apiKey.includes('replace_me')) {
    throw new Error('LLM API Key not configured in .env file.');
  }

  let endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  if (provider === 'openai') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
  } else if (provider === 'google' || provider === 'gemini') {
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  }

  const systemPrompt = `You are a professional email analysis and prioritization AI.
Strictly analyze the incoming email and return a valid JSON object ONLY.
Do not output any thinking process, explanations, reasoning, or markdown formatting. Start directly with the opening curly brace "{" and end with "}".

The JSON structure must be exactly:
{
  "category": "One of: 'Important' | 'Action Required' | 'Meetings' | 'Recruiters' | 'GitHub' | 'Finance' | 'Shopping' | 'Promotions' | 'Spam' | 'Work' | 'Personal' | 'Education'",
  "importance": "One of: 'High' | 'Medium' | 'Low'",
  "summary": "A concise, one-sentence, punchy, high-level summary of the main action point in the ${language} language.",
  "aiMetadata": {
    "actionRequired": true/false (true if there is a task or action required from the recipient),
    "actionDetails": "Brief description of the action required, or null if none",
    "deadline": "Detected deadline date/time description, or null if none",
    "classifications": ["Array containing tags from this list if applicable: 'OTP', 'Invoice', 'Meeting', 'Recruiter', 'Scam', 'Spam'"],
    "spamScore": 0-100 (probability score of being spam or scam),
    "calendarEvent": {
      "title": "Title of meeting or event",
      "start": "ISO String or plain date string of start time",
      "end": "ISO String or plain date string of end time"
    } or null if no calendar event is detected
  }
}`;

  const userMessage = `From: ${from}
Subject: ${subject}
Body Content: ${content}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'Mail2WhatsApp AI Daemon';
  }

  if (provider === 'google' || provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt > 1) {
          console.warn(`[AI] Google Gen AI attempt 1 failed with transient error. Retrying in 1.5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        const response = await ai.models.generateContent({
          model: initialModel,
          contents: userMessage,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const text = response.text;
        if (!text) {
          throw new Error('Received empty response from Gemini API.');
        }

        console.log('Raw LLM Response:', text);

        let cleanedText = text.trim();
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }

        const result = JSON.parse(cleanedText);
        return {
          category: result.category || 'Work',
          importance: result.importance || 'Medium',
          summary: result.summary || subject,
          aiMetadata: result.aiMetadata || null
        };
      } catch (err: any) {
        lastError = err;
        console.error(`[AI] Google Gen AI attempt ${attempt} failed:`, err.message);
        
        // If it's a permanent configuration error (like 404 Model Not Found or Auth issue), do not retry
        if (err.status === 404 || err.status === 401 || err.status === 403) {
          break;
        }
      }
    }
    
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey && !openrouterKey.includes('replace_me')) {
      console.warn('[AI] Google Gen AI failed. Attempting automatic fallback to OpenRouter...');
      try {
        const fallbackResult = await callOpenRouterFallback(openrouterKey, userMessage, systemPrompt, subject);
        return fallbackResult;
      } catch (orErr: any) {
        console.error('[AI] OpenRouter fallback also failed:', orErr.message);
      }
    }
    
    throw lastError || new Error('Google Gen AI calls failed after retries.');
  }

  // Define the queue of models to try
  const modelsToTry = [initialModel];
  if (provider === 'openrouter') {
    for (const modelName of OPENROUTER_FALLBACK_MODELS) {
      if (modelName !== initialModel) {
        modelsToTry.push(modelName);
      }
    }
  }

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      if (i > 0) {
        console.warn(`[AI] Attempt with model "${initialModel}" was rate-limited. Trying fallback model "${currentModel}"...`);
      }

      const payload: any = {
        model: currentModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 500
      };

      if (provider !== 'google' && provider !== 'gemini') {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        const status = res.status;
        const err = new Error(`LLM API request failed: ${res.statusText} (${res.status}). Details: ${errText}`);
        (err as any).status = status;
        throw err;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('Received empty response from LLM API.');
      }

      console.log('Raw LLM Response:', text);

      let cleanedText = text.trim();
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
      }

      const result = JSON.parse(cleanedText);
      return {
        category: result.category || 'Work',
        importance: result.importance || 'Medium',
        summary: result.summary || subject,
        aiMetadata: result.aiMetadata || null
      };

    } catch (err: any) {
      lastError = err;
      console.error(`[AI] Error during LLM request with model "${currentModel}":`, err.message);

      // Only attempt fallback if the provider is openrouter, it returned a 429 status code, and we have more models left to try
      if (provider === 'openrouter' && err.status === 429 && i < modelsToTry.length - 1) {
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('All LLM model attempts failed.');
}

export function getFallbackAnalysis(from: string, subject: string, content: string): LLMResult {
  const lowerSubject = subject.toLowerCase();
  const lowerFrom = from.toLowerCase();
  const lowerContent = content.toLowerCase();

  let category = 'Work';
  let importance: 'High' | 'Medium' | 'Low' = 'Medium';
  let summary = subject;

  if (lowerSubject.includes('fraud') || lowerSubject.includes('blocked') || lowerSubject.includes('charge') || lowerSubject.includes('billing')) {
    category = 'Finance';
    importance = 'High';
    summary = `Billing alert: ${subject}`;
  } else if (lowerSubject.includes('security') || lowerSubject.includes('alert') || lowerSubject.includes('leaked') || lowerFrom.includes('github')) {
    category = 'GitHub';
    importance = 'High';
    summary = `Security Alert from Github: ${subject}`;
  } else if (lowerSubject.includes('shipped') || lowerSubject.includes('order') || lowerSubject.includes('amazon')) {
    category = 'Shopping';
    importance = 'Low';
    summary = `Delivery Update: ${subject}`;
  } else if (lowerSubject.includes('meeting') || lowerSubject.includes('kickoff') || lowerSubject.includes('schedule') || lowerSubject.includes('rescheduled')) {
    category = 'Meetings';
    importance = 'High';
    summary = `Meeting update: ${subject}`;
  } else if (lowerSubject.includes('recruiter') || lowerSubject.includes('career') || lowerSubject.includes('job opportunity') || lowerSubject.includes('hiring')) {
    category = 'Recruiters';
    importance = 'Medium';
    summary = `Recruiting query: ${subject}`;
  } else if (lowerSubject.includes('free') || lowerSubject.includes('lottery') || lowerSubject.includes('bitcoin') || lowerSubject.includes('claim') || lowerContent.includes('lottery') || lowerContent.includes('win free')) {
    category = 'Spam';
    importance = 'Low';
    summary = `Spam folder match: ${subject}`;
  } else if (lowerSubject.includes('newsletter') || lowerSubject.includes('weekly') || lowerSubject.includes('medium')) {
    category = 'Education';
    importance = 'Low';
    summary = `Subscription digest: ${subject}`;
  }

  return {
    category,
    importance,
    summary,
    aiMetadata: {
      actionRequired: category === 'Meetings' || category === 'Important' || category === 'Action Required',
      actionDetails: category === 'Meetings' ? 'Attend meeting' : null,
      deadline: null,
      classifications: category === 'Spam' ? ['Spam'] : (category === 'Meetings' ? ['Meeting'] : (category === 'Recruiters' ? ['Recruiter'] : [])),
      spamScore: category === 'Spam' ? 95 : 5,
      calendarEvent: null
    }
  };
}

async function callOpenRouterFallback(
  apiKey: string,
  userMessage: string,
  systemPrompt: string,
  subject: string
): Promise<LLMResult> {
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Mail2WhatsApp AI Daemon'
  };

  const fallbackModels = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3-8b-instruct:free',
    'qwen/qwen-2-7b-instruct:free'
  ];

  let lastError: any = null;
  for (const model of fallbackModels) {
    try {
      console.log(`[AI] Attempting OpenRouter fallback with model: ${model}`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('Received empty response from OpenRouter.');
      }

      let cleanedText = text.trim();
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      }

      const result = JSON.parse(cleanedText);
      return {
        category: result.category || 'Work',
        importance: result.importance || 'Medium',
        summary: result.summary || subject,
        aiMetadata: result.aiMetadata || null
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI] OpenRouter fallback model ${model} failed:`, err.message);
    }
  }
  throw lastError || new Error('All OpenRouter fallback models failed.');
}
