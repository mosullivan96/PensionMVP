const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    const apiKey = process.env.REACT_APP_CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'Request body must include a messages array.' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',  // Updated to latest model
        max_tokens: 100,
        system: `You are an agent called Tarra, at the front of a pension advice website. You never give advice under any circumstances. Your goal is to converse until you have gathered the following fields for database insertion: user_id (system-assigned), CreatedAt (timestamp), date_of_birth (ask only for month and year), drawdown_start_age, annual_income_need, state_pension_annual, state_pension_start_age, other_income_annual, current_tax_band, expected_retirement_tax_band, other_info.`,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: typeof msg.content === 'string'
            ? [{ type: 'text', text: msg.content }]
            : msg.content
        }))
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ error: errorData || `Upstream error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error calling Claude API:', error);
    const message = error.name === 'AbortError'
      ? 'Request timed out. Please try again.'
      : error.message;
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});

