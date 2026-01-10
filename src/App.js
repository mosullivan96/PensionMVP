import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Group } from '@visx/group';
import { Bar as VisxBar, LinePath } from '@visx/shape';
import { scaleLinear, scaleBand } from '@visx/scale';
import { AxisBottom, AxisLeft, AxisRight } from '@visx/axis';
import { ParentSize } from '@visx/responsive';
import { curveMonotoneX } from '@visx/curve';
import logo from './Logo.png';
import { supabase } from './supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import './App.css';

const TABLE_LABELS = {
  pension_pots: {
    label: "Pension Accounts",
    fields: {
      provider_name: "Provider",
      pot_type: "Type",
      current_value: "Current Value",
      monthly_contribution: "Monthly Contrib.",
      is_active: "Active"
    }
  },
  property: {
    label: "Property Assets",
    fields: {
      property_type: "Type",
      address: "Address",
      current_value: "Current Value",
      mortgage_balance: "Mortgage Balance"
    }
  },
  state_pension: {
    label: "State Pension",
    fields: {
      estimated_annual_amount: "Annual Amount",
      state_pension_age: "Start Age",
      qualifying_years: "Qualifying Years"
    }
  },
  liabilities: {
    label: "Debts & Liabilities",
    fields: {
      liability_type: "Type",
      creditor_name: "Creditor",
      current_balance: "Total Balance"
    }
  },
  db_pensions: {
    label: "Final Salary Pensions",
    fields: {
      scheme_name: "Scheme Name",
      employer: "Employer",
      annual_pension_amount: "Annual Amount",
      pension_start_age: "Start Age"
    }
  },
  isa_accounts: {
    label: "ISA Accounts",
    fields: {
      provider_name: "Provider",
      isa_type: "Type",
      current_balance: "Balance"
    }
  },
  investment_accounts: {
    label: "Investments",
    fields: {
      provider_name: "Provider",
      account_type: "Type",
      current_value: "Value"
    }
  },
  other_assets: {
    label: "Other Assets",
    fields: {
      asset_name: "Asset Name",
      asset_type: "Type",
      current_value: "Value"
    }
  },
  income_sources: {
    label: "Additional Income",
    fields: {
      source_name: "Source",
      income_type: "Type",
      annual_amount: "Annual Amount"
    }
  },
  expenses: {
    label: "Budget & Expenses",
    fields: {
      expense_name: "Expense Name",
      expense_category: "Category",
      annual_amount: "Annual Amount"
    }
  },
  withdrawal_strategy: {
    label: "Withdrawal Plans",
    fields: {
      scenario_name: "Scenario",
      lump_sum_strategy: "Lump Sum Plan",
      withdrawal_order: "Withdrawal Order"
    }
  },
  life_events: {
    label: "Future Events",
    fields: {
      event_name: "Event",
      event_type: "Type",
      cost: "Estimated Cost"
    }
  },
  tax_calculations: {
    label: "Tax Summaries",
    fields: {
      tax_year: "Tax Year",
      total_income: "Total Income",
      total_tax_paid: "Total Tax"
    }
  },
  projections: {
    label: "Saved Simulations",
    fields: {
      projection_type: "Type",
      success_probability: "Success %",
      depletion_age: "Funds Run Out Age"
    }
  },
  spouse_data: {
    label: "Partner Data",
    fields: {
      name: "Partner Name",
      total_pension_value: "Pension Value",
      state_pension_amount: "State Pension"
    }
  },
  beneficiaries: {
    label: "Legacy & Inheritance",
    fields: {
      name: "Beneficiary",
      relationship: "Relationship",
      intended_inheritance: "Planned Amount"
    }
  },
  health_costs: {
    label: "Healthcare Costs",
    fields: {
      chronic_conditions: "Conditions",
      medications_monthly_cost: "Medication Cost",
      insurance_premium_annual: "Insurance Premium"
    }
  },
  goals: {
    label: "Financial Goals",
    fields: {
      goal_name: "Goal",
      target_amount: "Target Amount",
      target_age: "Target Age"
    }
  }
};

const ProjectionChartInner = ({ data, retirementAge, width, height }) => {
  const margin = { top: 20, right: 60, bottom: 60, left: 60 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, xMax],
        round: true,
        domain: data.map((d) => (d.age ? `Age ${d.age}` : d.year.toString())),
        padding: 0.4,
      }),
    [xMax, data]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [yMax, 0],
        round: true,
        domain: [0, Math.max(...data.map((d) => d.pensionTotal), 100000) * 1.1],
      }),
    [yMax, data]
  );

  const yIncomeScale = useMemo(
    () =>
      scaleLinear({
        range: [yMax, 0],
        round: true,
        domain: [0, Math.max(...data.map((d) => d.cashIncome), 10000) * 1.2],
      }),
    [yMax, data]
  );

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {/* Pension Bars */}
        {data.map((d) => {
          const label = d.age ? `Age ${d.age}` : d.year.toString();
          const barWidth = xScale.bandwidth();
          const barHeight = yMax - yScale(d.pensionTotal);
          const barX = xScale(label);
          const barY = yMax - barHeight;
          const isRetired = d.age >= retirementAge;

          return (
            <VisxBar
              key={d.year}
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={isRetired ? "#2563eb" : "#93c5fd"}
              rx={4}
              opacity={0.8}
            />
          );
        })}

        {/* Income Line Overlay */}
        <LinePath
          data={data}
          x={(d) => xScale(d.age ? `Age ${d.age}` : d.year.toString()) + xScale.bandwidth() / 2}
          y={(d) => yIncomeScale(d.cashIncome)}
          stroke="#f59e0b"
          strokeWidth={3}
          curve={curveMonotoneX}
        />

        {/* Income Points */}
        {data.map((d) => (
          <circle
            key={`point-${d.year}`}
            cx={xScale(d.age ? `Age ${d.age}` : d.year.toString()) + xScale.bandwidth() / 2}
            cy={yIncomeScale(d.cashIncome)}
            r={4}
            fill="#f59e0b"
            stroke="white"
            strokeWidth={2}
          />
        ))}

        <AxisLeft
          scale={yScale}
          tickFormat={(val) => `£${(val / 1000).toFixed(0)}k`}
          stroke="#e5e7eb"
          tickStroke="#e5e7eb"
          tickLabelProps={() => ({
            fill: "#6b7280",
            fontSize: 10,
            textAnchor: "end",
            dy: "0.33em",
          })}
        />
        
        <AxisRight
          left={xMax}
          scale={yIncomeScale}
          tickFormat={(val) => `£${(val / 1000).toFixed(1)}k`}
          stroke="#e5e7eb"
          tickStroke="#e5e7eb"
          label="Annual Income"
          labelProps={{
            fill: "#f59e0b",
            fontSize: 12,
            fontWeight: 600,
            textAnchor: "middle",
          }}
          tickLabelProps={() => ({
            fill: "#f59e0b",
            fontSize: 10,
            textAnchor: "start",
            dx: "0.33em",
            dy: "0.33em",
          })}
        />

        <AxisBottom
          top={yMax}
          scale={xScale}
          stroke="#e5e7eb"
          tickStroke="#e5e7eb"
          tickLabelProps={() => ({
            fill: "#6b7280",
            fontSize: 10,
            textAnchor: "middle",
          })}
        />
      </Group>
    </svg>
  );
};

const ProjectionChart = ({ data, retirementAge }) => {
  return (
    <ParentSize>
      {({ width, height }) => (
        <ProjectionChartInner 
          data={data} 
          retirementAge={retirementAge} 
          width={width} 
          height={height} 
        />
      )}
    </ParentSize>
  );
};

function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [projections, setProjections] = useState(null);
  const [hasSavedData, setHasSavedData] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [sidebarData, setSidebarData] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedIntegrations, setExpandedIntegrations] = useState({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [plannedRetirementAge, setPlannedRetirementAge] = useState(67);
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
  const makeUuid = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `uuid-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const extractDataPayload = (text) => {
    if (!text) return null;
    const match = text.match(/<data>\s*([\s\S]*?)\s*<\/data>/);
    if (!match || !match[1]) return null;
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      console.error('Failed to parse <data> JSON:', err);
      return null;
    }
  };

  const persistUserData = async (payload) => {
    if (!supabase || !user || !payload) return;
    try {
      const record = {
        user_id: user.id,
        email: user.email ?? null,
        date_of_birth: payload.date_of_birth ?? null,
        retirement_age: payload.planned_retirement_age ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('users')
        .upsert(record, { onConflict: 'email' });
      if (error) {
        console.error('Supabase users upsert error:', error.message);
      } else {
        console.info('Supabase users upsert success');
      }
    } catch (err) {
      console.error('Supabase users upsert failure:', err);
    }
  };

  const persistPropertyData = async (payload) => {
    if (!supabase || !user || !payload) return;
    if (payload.property_value === undefined || payload.property_value === null) return;
    try {
      const record = {
        property_id: user.id,
        user_id: user.id,
        current_value: payload.property_value,
        valuation_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('property')
        .upsert(record, { onConflict: 'property_id' });
      if (error) {
        console.error('Supabase property upsert error:', error.message);
      } else {
        console.info('Supabase property upsert success');
      }
    } catch (err) {
      console.error('Supabase property upsert failure:', err);
    }
  };

  const persistStatePensionData = async (payload) => {
    if (!supabase || !user || payload.state_pension_amount === undefined || payload.state_pension_amount === null) return;
    try {
      const record = {
        state_pension_id: user.id, // stable per user
        user_id: user.id,
        estimated_annual_amount: payload.state_pension_amount,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('state_pension')
        .upsert(record, { onConflict: 'state_pension_id' });
      if (error) {
        console.error('Supabase state_pension upsert error:', error.message);
      } else {
        console.info('Supabase state_pension upsert success');
      }
    } catch (err) {
      console.error('Supabase state_pension upsert failure:', err);
    }
  };

  const persistLiabilitiesData = async (payload) => {
    if (!supabase || !user || payload.total_debt === undefined || payload.total_debt === null) return;
    try {
      const record = {
        liability_id: user.id, // stable per user
        user_id: user.id,
        liability_type: 'total_debt_summary',
        current_balance: payload.total_debt,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('liabilities')
        .upsert(record, { onConflict: 'liability_id' });
      if (error) {
        console.error('Supabase liabilities upsert error:', error.message);
      } else {
        console.info('Supabase liabilities upsert success');
      }
    } catch (err) {
      console.error('Supabase liabilities upsert failure:', err);
    }
  };

  const persistPensionPotData = async (payload) => {
    if (!supabase || !user || payload.total_pension_value === undefined || payload.total_pension_value === null) return;
    try {
      const record = {
        pot_id: user.id, // stable per user
        user_id: user.id,
        provider_name: 'Combined pensions',
        pot_type: 'aggregate',
        current_value: payload.total_pension_value,
        as_of_date: new Date().toISOString().split('T')[0],
        monthly_contribution: payload.monthly_contribution ?? null,
        is_active: payload.still_contributing ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('pension_pots')
        .upsert(record, { onConflict: 'pot_id' });
      if (error) {
        console.error('Supabase pension_pots upsert error:', error.message);
      } else {
        console.info('Supabase pension_pots upsert success');
      }
    } catch (err) {
      console.error('Supabase pension_pots upsert failure:', err);
    }
  };

  const calculateProjections = (data) => {
    const years = 10;
    const results = [];
    const currentYear = new Date().getFullYear();
    const growthRate = 0.05; // 5%
    const inflationRate = 0.025; // 2.5%

    let currentAge = null;
    if (data.date_of_birth) {
      const dob = new Date(data.date_of_birth);
      const today = new Date();
      currentAge = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        currentAge--;
      }
    }

    let currentPension = data.total_pension_value || 0;
    const monthlyContribution = data.monthly_contribution || 0;
    const annualContribution = monthlyContribution * 12;
    const propertyValue = data.property_value || 0;
    const totalDebt = data.total_debt || 0;
    const statePensionAmount = data.state_pension_amount || 0;
    
    if (data.planned_retirement_age) {
      setPlannedRetirementAge(data.planned_retirement_age);
    }

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      const age = currentAge !== null ? currentAge + i : null;
      
      // Pension growth
      if (i > 0) {
        currentPension = currentPension * (1 + growthRate) + annualContribution;
      }

      // ... existing Net Worth, Cash Income, Taxes calculations ...
      const netWorth = currentPension + propertyValue - totalDebt;
      const cashIncome = statePensionAmount * Math.pow(1 + inflationRate, i);
      const taxableIncome = Math.max(0, cashIncome - 12570);
      const estimatedTax = taxableIncome * 0.2;

      results.push({
        year,
        age,
        pensionTotal: Math.round(currentPension),
        netWorth: Math.round(netWorth),
        cashIncome: Math.round(cashIncome),
        taxes: Math.round(estimatedTax)
      });
    }
    setProjections(results);
    setHasSavedData(true);
  };

  const fetchSidebarData = async () => {
    if (!supabase || !user) return;
    try {
      const results = {};
      const tablesToFetch = [...Object.keys(TABLE_LABELS), 'users'];
      for (const table of tablesToFetch) {
        const userColumn = table === 'spouse_data' ? 'primary_user_id' : 'user_id';
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq(userColumn, user.id);
        
        if (!error && data) {
          results[table] = data[0] || null;
        }
      }
      setSidebarData(results);
    } catch (err) {
      console.error('Error fetching sidebar data:', err);
    }
  };

  const toggleSection = (table) => {
    setExpandedSections(prev => ({
      ...prev,
      [table]: !prev[table]
    }));
  };

  const handleDashboardClick = async (e) => {
    console.log('Dashboard clicked');
    if (e) e.preventDefault();
    if (!user || !supabase) {
      console.log('No user or supabase');
      setShowAuth(true);
      return;
    }

    try {
      const results = {};
      const tablesToFetch = [...Object.keys(TABLE_LABELS), 'users'];
      for (const table of tablesToFetch) {
        console.log(`Fetching from table: ${table}`);
        const userColumn = table === 'spouse_data' ? 'primary_user_id' : 'user_id';
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq(userColumn, user.id);
        
        if (error) {
          console.error(`Error fetching ${table}:`, error.message);
        }
        
        if (!error && data) {
          results[table] = data[0] || null;
        }
      }
      console.log('Fetched sidebar data:', results);
      setSidebarData(results);

      if (results.users || results.pension_pots) {
        const payload = {
          date_of_birth: results.users?.date_of_birth,
          planned_retirement_age: results.users?.retirement_age,
          total_pension_value: results.pension_pots?.current_value,
          monthly_contribution: results.pension_pots?.monthly_contribution,
          still_contributing: results.pension_pots?.is_active,
          property_value: results.property?.current_value,
          total_debt: results.liabilities?.current_balance,
          state_pension_amount: results.state_pension?.estimated_annual_amount
        };

        console.log('Calculated payload:', payload);

        if (payload.total_pension_value || payload.date_of_birth) {
          calculateProjections(payload);
          setHasSavedData(true);
          if (messages.length === 0) {
            setMessages([{
              id: makeId(),
              role: 'assistant',
              content: 'Welcome back! Here is your latest simulation based on your profile data.'
            }]);
          }
        }
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  };

  const formatValue = (val) => {
    if (val === null || val === undefined || val === '') return 'Empty';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') {
      if (val > 1000) return `£${val.toLocaleString()}`;
      return val.toString();
    }
    return val.toString();
  };

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
            { onConflict: 'email' }
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
    
    // Check if user has any saved data to determine landing title
    const checkSavedData = async () => {
      if (!user || !supabase) return;
      const { data, error } = await supabase
        .from('pension_pots')
        .select('current_value')
        .eq('user_id', user.id)
        .limit(1);
      
      if (!error && data && data.length > 0) {
        setHasSavedData(true);
      } else {
        setHasSavedData(false);
      }
    };
    checkSavedData();
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
      console.log('Received from Claude:', assistantText);
      const extracted = extractDataPayload(assistantText);
      if (extracted) {
        console.log('Data extracted successfully:', extracted);
        persistUserData(extracted);
        persistPropertyData(extracted);
        persistStatePensionData(extracted);
        persistLiabilitiesData(extracted);
        persistPensionPotData(extracted);
        calculateProjections(extracted);
        fetchSidebarData();
        const summaryMessage = {
          id: makeUuid(),
          role: 'assistant',
          content: 'Perfect, we have all the data we need. Generating Simulation.',
        };
        setMessages((prev) => [...prev, summaryMessage]);
      } else {
        const assistantMessage = { id: makeUuid(), role: 'assistant', content: assistantText };
        setMessages((prev) => [...prev, assistantMessage]);
      }
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
    setProjections(null);
    setSidebarData({});
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
          {user && hasSavedData && (
            <a href="#dashboard" onClick={handleDashboardClick}>
              Dashboard
            </a>
          )}
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
                {!user 
                  ? 'Tell us about your pension situation.' 
                  : hasSavedData 
                    ? 'Provide an update.' 
                    : 'Describe your pension status.'
                }
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
                  Enter
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`chat-layout ${projections ? 'with-projections' : ''}`}>
            {projections && (
              <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                  <button 
                    className="sidebar-toggle"
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                  >
                    <span className={`arrow-head ${isSidebarCollapsed ? 'right' : 'left'}`}></span>
                  </button>
                </div>
                {!isSidebarCollapsed && (
                  <div className="sidebar-content">
                    <div className="sidebar-group">
                      <div className="sidebar-group-header">Integrations</div>
                      {['Banking', 'Investments', 'Pensions'].map((item) => (
                        <div key={item} className="sidebar-section">
                          <div 
                            className={`sidebar-row-header ${expandedIntegrations[item] ? 'expanded' : ''}`}
                            onClick={() => setExpandedIntegrations(prev => ({ ...prev, [item]: !prev[item] }))}
                          >
                            <span>{item}</span>
                            <span className="chevron"></span>
                          </div>
                          {expandedIntegrations[item] && (
                            <div className="sidebar-row-details">
                              <div className="sidebar-detail-item">
                                <span className="detail-value italic">No active connections</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="sidebar-group">
                      <div className="sidebar-group-header">Profile</div>
                      {Object.entries(TABLE_LABELS).map(([table, config]) => (
                        <div key={table} className="sidebar-section">
                          <div 
                            className={`sidebar-row-header ${expandedSections[table] ? 'expanded' : ''}`}
                            onClick={() => toggleSection(table)}
                          >
                            <span>{config.label}</span>
                            <span className="chevron"></span>
                          </div>
                          {expandedSections[table] && (
                            <div className="sidebar-row-details">
                              {Object.entries(config.fields).map(([field, label]) => (
                                <div key={field} className="sidebar-detail-item">
                                  <span className="detail-label">{label}</span>
                                  <span className="detail-value">
                                    {formatValue(sidebarData[table]?.[field])}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {projections && (
              <div className="projections-container">
                <div className="projections-card">
                  <div className="projections-header">
                    <h2 className="projections-title">10-Year Simulation</h2>
                    <div className="view-toggle">
                      <button 
                        className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                      >
                        Table
                      </button>
                      <button 
                        className={`toggle-btn ${viewMode === 'chart' ? 'active' : ''}`}
                        onClick={() => setViewMode('chart')}
                      >
                        Chart
                      </button>
                      <button 
                        className={`toggle-btn ${viewMode === 'guidance' ? 'active' : ''}`}
                        onClick={() => setViewMode('guidance')}
                      >
                        Guidance
                      </button>
                    </div>
                  </div>

                  {viewMode === 'table' ? (
                    <div className="projections-table-wrapper">
                      <table className="projections-table">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>Age</th>
                            <th>Pension Total</th>
                            <th>Net Worth</th>
                            <th>Cash Income</th>
                            <th>Est. Taxes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projections.map((p) => (
                            <tr key={p.year}>
                              <td>{p.year}</td>
                              <td>{p.age ?? 'N/A'}</td>
                              <td>£{p.pensionTotal.toLocaleString()}</td>
                              <td>£{p.netWorth.toLocaleString()}</td>
                              <td>£{p.cashIncome.toLocaleString()}</td>
                              <td>£{p.taxes.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : viewMode === 'chart' ? (
                    <>
                      <div className="projections-chart-wrapper">
                        <ProjectionChart data={projections} retirementAge={plannedRetirementAge} />
                      </div>
                      <div className="chart-legend-bottom">
                        <div className="legend-item">
                          <span className="dot pre-retirement"></span>
                          <span>Pre-retirement</span>
                        </div>
                        <div className="legend-item">
                          <span className="dot post-retirement"></span>
                          <span>Post-retirement</span>
                        </div>
                        <div className="legend-item">
                          <span className="line income-line"></span>
                          <span>Annual Income</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="projections-guidance-wrapper">
                      <div className="guidance-content">
                        <h3>Understanding Your Projection</h3>
                        <p>This 10-year simulation provides a high-level overview of your potential financial trajectory based on the data provided.</p>
                        
                        <div className="guidance-grid">
                          <div className="guidance-item">
                            <h4>Pension Accumulation</h4>
                            <p>Your pension is projected to grow at an estimated 5% annually. This includes your monthly contributions and compound growth on your existing balance.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Net Worth</h4>
                            <p>This represents your total assets (pension pots and property value) minus any liabilities like mortgages or personal debts.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Income & Taxes</h4>
                            <p>The "Cash Income" reflects your estimated state pension once you reach qualifying age, adjusted for 2.5% inflation. "Est. Taxes" assumes a simple 20% basic rate above the personal allowance (£12,570).</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Next Steps</h4>
                            <p>To refine these figures, consider discussing drawdown options or annuity products with a financial professional. These projections do not currently model specific withdrawal strategies.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="projections-assumptions">
                    <h3>Assumptions:</h3>
                    <ul>
                      <li>Annual Investment Growth: 5.0%</li>
                      <li>Annual Inflation: 2.5%</li>
                      <li>No drawdown or annuity products purchased yet</li>
                      <li>Tax calculation: Simple 20% above Personal Allowance</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

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
                  Enter
                </button>
              </div>
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
