import { useState, useRef, useEffect, useCallback } from 'react';
import logo from './Logo.png';
import { supabase } from './supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdateStatus, setPasswordUpdateStatus] = useState('');
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const userSyncingRef = useRef(false);

  const makeId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const ensureUserRecord = useCallback(
    async (authUser) => {
      if (!supabase || !authUser || userSyncingRef.current) return;
      userSyncingRef.current = true;
      try {
        const { error } = await supabase
          .from('users')
          .upsert(
            {
              user_id: authUser.id,
              email: authUser.email,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
        if (error) {
          console.error('Supabase user upsert error:', error.message);
        }
      } catch (err) {
        console.error('Supabase user upsert failure:', err);
      } finally {
        userSyncingRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
      ensureUserRecord(data?.user ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      ensureUserRecord(session?.user ?? null);
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [ensureUserRecord]);

  // Handle password recovery links (?type=recovery in hash)
  useEffect(() => {
    if (!supabase) return;
    const hash = window.location.hash;
    if (!hash || !hash.includes('type=recovery')) return;
    const params = new URLSearchParams(hash.replace('#', ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ data, error }) => {
          if (error) {
            console.error('Supabase recovery session error:', error.message);
            return;
          }
          setUser(data?.session?.user ?? null);
          setIsRecoverySession(true);
          setShowAuth(false);
          setShowReset(false);
          setPasswordUpdateStatus('');
          setNewPassword('');
          setConfirmPassword('');
        });
    } else {
      setIsRecoverySession(true);
      setShowAuth(false);
      setShowReset(false);
    }
  }, []);

  useEffect(() => {
    if (user && showAuth) {
      setShowAuth(false);
    }
  }, [user, showAuth]);

  const logPrompt = async (text) => {
    if (!supabase) {
      console.warn('Supabase client not initialized; prompt not logged.');
      return;
    }
    try {
      const payload = {
        prompt: text,
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('Raw_Prompts').insert(payload);
      if (error) {
        console.error('Supabase insert error:', error.message);
      } else {
        console.info('Supabase insert success');
      }
    } catch (err) {
      console.error('Supabase insert failure:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    if (!user) {
      setShowAuth(true);
      return;
    }

    const userMessage = { id: makeId(), role: 'user', content: inputText.trim() };
    setInputText('');
    setIsLoading(true);

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    logPrompt(userMessage.content);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: nextMessages })
      });

      if (!response.ok) {
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error) errorMessage = errorData.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const assistantText = data?.content?.[0]?.text || 'No response received.';
      const assistantMessage = { id: makeId(), role: 'assistant', content: assistantText };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error calling Claude API:', error);
      const errorMessage = `Error: ${error.message}. Please check your API key and try again.`;
      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInputText('');
    setIsLoading(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  const hasConversation = messages.length > 0;

  return (
    <div className={`App ${hasConversation ? 'has-chat' : 'landing'}`}>
      <header className="top-bar">
        <div
          className="brand"
          role="button"
          tabIndex={0}
          onClick={handleReset}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleReset()}
        >
          <img src={logo} alt="Tarra logo" className="brand-logo" />
          <span className="brand-name">Tarra</span>
        </div>
        <nav className="nav-links">
          {user && <a href="#dashboard">Dashboard</a>}
          <a href="#documentation">Documentation</a>
          <a href="#contact">Contact</a>
          {!user ? (
            <button
              className="login-button"
              type="button"
              onClick={() => {
                setShowAuth(true);
              }}
            >
              Log in
            </button>
          ) : (
            <button className="login-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          )}
        </nav>
      </header>

      <main className={`main ${hasConversation ? 'has-chat' : 'landing'}`}>
        {!hasConversation ? (
          <div className="landing-container">
            <div className="landing-card">
              <h1 className="landing-title">
                {user ? 'Provide an update.' : 'Tell us about your pension situation.'}
              </h1>
              <p className="landing-subtitle">
                Please omit any personal data like names, addresses etc. Disclaimer: Anything entered is stored in a secure database.
              </p>
              <textarea
                className="text-box landing-input"
                placeholder="Type your message..."
                rows={4}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <div className="landing-actions">
                <button
                  className="enter-button"
                  onClick={sendMessage}
                  disabled={isLoading || !inputText.trim()}
                >
                  Generate Simulation
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-container">
            <div className="messages-area">
              {messages.map((message) => (
                <div key={message.id || message.content} className={`message ${message.role}`}>
                  <div className="message-content">
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-content">
                    <span className="typing-indicator">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <textarea
                className="text-box"
                placeholder="Type your message..."
                rows={3}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                className="enter-button"
                onClick={sendMessage}
                disabled={isLoading || !inputText.trim()}
              >
                Generate Simulation
              </button>
            </div>
          </div>
        )}
      </main>

      {showAuth && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Log in</h3>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowAuth(false)}
                aria-label="Close login"
              >
                ×
              </button>
            </div>
            <p className="modal-subtitle">Use your email and password to continue.</p>
            <div className="auth-ui-wrapper">
              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={[]}
                view="sign_in"
              />
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setShowReset(true);
                  setShowAuth(false);
                }}
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      )}

      {showReset && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Reset password</h3>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setResetStatus('');
                }}
                aria-label="Close reset"
              >
                ×
              </button>
            </div>
            <p className="modal-subtitle">
              Enter your account email to receive a password reset link.
            </p>
            {resetStatus && <div className="modal-info">{resetStatus}</div>}
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowReset(false);
                  setResetStatus('');
                }}
                disabled={resetLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={async () => {
                  if (!supabase) return;
                  setResetLoading(true);
                  setResetStatus('');
                  const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                    redirectTo: window.location.origin,
                  });
                  setResetLoading(false);
                  if (error) {
                    setResetStatus(error.message);
                  } else {
                    setResetStatus('Check your email for the reset link.');
                  }
                }}
                disabled={resetLoading || !resetEmail}
              >
                {resetLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRecoverySession && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Set new password</h3>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setIsRecoverySession(false);
                  setPasswordUpdateStatus('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                aria-label="Close password reset"
              >
                ×
              </button>
            </div>
            <p className="modal-subtitle">
              Enter and confirm your new password to complete the reset.
            </p>
            {passwordUpdateStatus && <div className="modal-info">{passwordUpdateStatus}</div>}
            <input
              className="auth-input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setIsRecoverySession(false);
                  setPasswordUpdateStatus('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                disabled={passwordUpdateLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={async () => {
                  if (!supabase) return;
                  if (!newPassword || newPassword !== confirmPassword) {
                    setPasswordUpdateStatus('Passwords must match.');
                    return;
                  }
                  setPasswordUpdateLoading(true);
                  setPasswordUpdateStatus('');
                  const { error } = await supabase.auth.updateUser({ password: newPassword });
                  setPasswordUpdateLoading(false);
                  if (error) {
                    setPasswordUpdateStatus(error.message);
                  } else {
                    setPasswordUpdateStatus('Password updated. You can now close this dialog.');
                  }
                }}
                disabled={
                  passwordUpdateLoading ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword
                }
              >
                {passwordUpdateLoading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
