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

// Default retirement age
const DEFAULT_RETIREMENT_AGE = 67;

// Tables that can have multiple records per user
const MULTI_RECORD_TABLES = ['life_events', 'pension_pots', 'isa_accounts', 'investment_accounts'];

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

const ProjectionChartInner = ({ data, retirementAge, width, height, onRetirementAgeChange }) => {
  const margin = { top: 20, right: 70, bottom: 60, left: 70 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragAge, setDragAge] = useState(retirementAge);
  const svgRef = useRef(null);

  // Show all years for granular view
  const displayData = data;
  
  // X-axis labels only show every 5 years to avoid crowding
  const labelData = data.filter((d, i) => i % 5 === 0 || i === data.length - 1);
  
  // Get min and max ages from data
  const minAge = data[0]?.age || 50;
  const maxAge = data[data.length - 1]?.age || 90;

  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, xMax],
        round: true,
        domain: displayData.map((d) => (d.age ? `Age ${d.age}` : d.year.toString())),
        padding: 0.15,
      }),
    [xMax, displayData]
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
        domain: [0, Math.max(...data.map((d) => d.totalIncome), 10000) * 1.2],
      }),
    [yMax, data]
  );

  // Get x position for retirement line
  const getRetirementX = (age) => {
    const label = `Age ${age}`;
    const x = xScale(label);
    return x !== undefined ? x : 0;
  };

  // Convert x position to age
  const xToAge = useCallback((xPos) => {
    const step = xScale.step();
    const index = Math.round(xPos / step);
    const clampedIndex = Math.max(0, Math.min(index, data.length - 1));
    return data[clampedIndex]?.age || retirementAge;
  }, [xScale, data, retirementAge]);

  // Handle mouse/touch events for dragging
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !svgRef.current) return;
    
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const xPos = (e.clientX || e.touches?.[0]?.clientX) - rect.left - margin.left;
    const newAge = xToAge(xPos);
    
    if (newAge >= minAge && newAge <= maxAge && newAge !== dragAge) {
      setDragAge(newAge);
    }
  }, [isDragging, dragAge, minAge, maxAge, margin.left, xToAge]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragAge !== retirementAge && onRetirementAgeChange) {
      onRetirementAgeChange(dragAge);
    }
    setIsDragging(false);
  }, [isDragging, dragAge, retirementAge, onRetirementAgeChange]);

  // Add global event listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Update dragAge when retirementAge prop changes
  useEffect(() => {
    setDragAge(retirementAge);
  }, [retirementAge]);

  const retirementX = getRetirementX(isDragging ? dragAge : retirementAge);
  const displayRetirementAge = isDragging ? dragAge : retirementAge;

  return (
    <svg ref={svgRef} width={width} height={height} style={{ cursor: isDragging ? 'ew-resize' : 'default' }}>
      <Group left={margin.left} top={margin.top}>
        {/* Pension Bars - all years */}
        {displayData.map((d) => {
          const label = d.age ? `Age ${d.age}` : d.year.toString();
          const barWidth = xScale.bandwidth();
          const barHeight = yMax - yScale(d.pensionTotal);
          const barX = xScale(label);
          const barY = yMax - barHeight;
          const isRetired = d.age >= displayRetirementAge;
          const isDepleted = d.fundsDepleted;

          return (
            <VisxBar
              key={d.year}
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={isDepleted ? "#ef4444" : isRetired ? "#2563eb" : "#93c5fd"}
              rx={2}
              opacity={0.9}
            />
          );
        })}

        {/* Draggable Retirement Line */}
        <g 
          transform={`translate(${retirementX}, 0)`}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          {/* Invisible wider hit area for easier dragging */}
          <rect
            x={-10}
            y={-10}
            width={20}
            height={yMax + 20}
            fill="transparent"
          />
          {/* Visible line */}
          <line
            x1={0}
            y1={-10}
            x2={0}
            y2={yMax}
            stroke={isDragging ? "#dc2626" : "#2563eb"}
            strokeWidth={isDragging ? 4 : 3}
            strokeDasharray={isDragging ? "none" : "6,4"}
          />
          {/* Drag handle circle */}
          <circle
            cx={0}
            cy={-15}
            r={8}
            fill={isDragging ? "#dc2626" : "#2563eb"}
            stroke="white"
            strokeWidth={2}
          />
          {/* Label */}
          <text
            x={0}
            y={-28}
            textAnchor="middle"
            fill={isDragging ? "#dc2626" : "#2563eb"}
            fontSize={11}
            fontWeight={600}
          >
            Retire: {displayRetirementAge}
          </text>
        </g>

        {/* Total Income Line Overlay */}
        <LinePath
          data={displayData}
          x={(d) => xScale(d.age ? `Age ${d.age}` : d.year.toString()) + xScale.bandwidth() / 2}
          y={(d) => yIncomeScale(d.totalIncome)}
          stroke="#10b981"
          strokeWidth={2.5}
          curve={curveMonotoneX}
        />

        {/* Income Points - only at key milestones to reduce clutter */}
        {labelData.map((d) => (
          <circle
            key={`point-${d.year}`}
            cx={xScale(d.age ? `Age ${d.age}` : d.year.toString()) + xScale.bandwidth() / 2}
            cy={yIncomeScale(d.totalIncome)}
            r={4}
            fill={d.incomeShortfall > 0 ? "#ef4444" : "#10b981"}
            stroke="white"
            strokeWidth={1.5}
          />
        ))}

        <AxisLeft
          scale={yScale}
          tickFormat={(val) => `£${(val / 1000).toFixed(0)}k`}
          stroke="#e5e7eb"
          tickStroke="#e5e7eb"
          label="Pension Pot"
          labelProps={{
            fill: "#2563eb",
            fontSize: 11,
            fontWeight: 600,
            textAnchor: "middle",
          }}
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
          tickFormat={(val) => `£${(val / 1000).toFixed(0)}k`}
          stroke="#e5e7eb"
          tickStroke="#e5e7eb"
          label="Total Income"
          labelProps={{
            fill: "#10b981",
            fontSize: 11,
            fontWeight: 600,
            textAnchor: "middle",
          }}
          tickLabelProps={() => ({
            fill: "#10b981",
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
          tickValues={labelData.map((d) => (d.age ? `Age ${d.age}` : d.year.toString()))}
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

const ProjectionChart = ({ data, retirementAge, onRetirementAgeChange }) => {
  return (
    <ParentSize>
      {({ width, height }) => (
        <ProjectionChartInner 
          data={data} 
          retirementAge={retirementAge} 
          width={width} 
          height={height}
          onRetirementAgeChange={onRetirementAgeChange}
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
  const [lifeEvents, setLifeEvents] = useState([]);
  const [lastBaseData, setLastBaseData] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [sidebarData, setSidebarData] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedIntegrations, setExpandedIntegrations] = useState({});
  const [expandedAssumptions, setExpandedAssumptions] = useState(false);
  const [expandedAssumptionGroups, setExpandedAssumptionGroups] = useState({
    growth: false,
    statePension: false,
    other: false,
  });
  const [expandedIntegrationsGroup, setExpandedIntegrationsGroup] = useState(false);
  const [expandedProfileGroup, setExpandedProfileGroup] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Editable assumptions state
  const [assumptions, setAssumptions] = useState({
    growthAccumulation: 5,      // % p.a.
    growthDrawdown: 4,          // % p.a.
    inflation: 2.5,             // % p.a.
    statePensionAge: 67,
    fullStatePension: 11502,    // £/year
    taxFreeLumpSum: 25,         // %
    propertyGrowth: 3,          // % p.a.
    planningHorizon: 90,        // Age
  });
  
  // Toggle assumption sub-group
  const toggleAssumptionGroup = (group) => {
    setExpandedAssumptionGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };
  const [showReset, setShowReset] = useState(false);
  const [plannedRetirementAge, setPlannedRetirementAge] = useState(DEFAULT_RETIREMENT_AGE);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdateStatus, setPasswordUpdateStatus] = useState('');
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const messagesEndRef = useRef(null);
  const userSyncingRef = useRef(false);
  
  // Single ID generator function
  const generateId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

  const extractLifeEvent = (text) => {
    if (!text) return null;
    const match = text.match(/<life_event>\s*([\s\S]*?)\s*<\/life_event>/);
    if (!match || !match[1]) return null;
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      console.error('Failed to parse <life_event> JSON:', err);
      return null;
    }
  };

  const persistLifeEventData = async (event) => {
    if (!supabase || !user || !event) return;
    try {
      const record = {
        event_id: generateId(),
        user_id: user.id,
        event_name: event.event_name,
        event_type: event.event_type,
        event_age: event.event_age,
        cost: event.cost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('life_events')
        .insert(record);
      
      if (error) {
        console.error('Supabase life_events insert error:', error.message);
      } else {
        console.info('Supabase life_events insert success');
        // Refresh sidebar and projections
        const { data: allEvents } = await supabase
          .from('life_events')
          .select('*')
          .eq('user_id', user.id);
        
        if (allEvents) {
          setLifeEvents(allEvents);
          await calculateProjections(null, allEvents);
        }
        fetchSidebarData();
      }
    } catch (err) {
      console.error('Supabase life_events insert failure:', err);
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

  // Call Python API for projections calculation
  const calculateProjections = async (data, events = [], customAssumptions = null) => {
    const baseData = data || lastBaseData;
    if (!baseData) return;
    
    if (data) setLastBaseData(data);
    
    // Set retirement age from data
    const retirementAge = baseData.planned_retirement_age || DEFAULT_RETIREMENT_AGE;
    if (retirementAge) {
      setPlannedRetirementAge(retirementAge);
    }

    // Use custom assumptions or current state
    const assumptionsToUse = customAssumptions || assumptions;

    try {
      const response = await fetch('http://localhost:5001/api/projections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: baseData,
          events: events,
          assumptions: {
            growth_accumulation: assumptionsToUse.growthAccumulation / 100,
            growth_drawdown: assumptionsToUse.growthDrawdown / 100,
            inflation: assumptionsToUse.inflation / 100,
            state_pension_age: assumptionsToUse.statePensionAge,
            full_state_pension: assumptionsToUse.fullStatePension,
            tax_free_lump_sum: assumptionsToUse.taxFreeLumpSum / 100,
            property_growth: assumptionsToUse.propertyGrowth / 100,
            planning_horizon: assumptionsToUse.planningHorizon,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Projections API error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.projections) {
        setProjections(result.projections);
        setHasSavedData(true);
        
        // Log depletion warning if applicable
        const depletedYear = result.projections.find(p => p.fundsDepleted);
        if (depletedYear) {
          console.info(`Warning: Funds projected to deplete at age ${depletedYear.age}`);
        }
      }
    } catch (error) {
      console.error('Error calculating projections:', error);
      // Fallback: set empty projections on error
      setProjections([]);
    }
  };

  // Helper to fetch all user data from Supabase tables
  const fetchAllUserData = async () => {
    if (!supabase || !user) return null;
    
    const tablesToFetch = [...Object.keys(TABLE_LABELS), 'users'];
    
    // Fetch all tables in parallel for speed
    const fetchPromises = tablesToFetch.map(async (table) => {
      const userColumn = table === 'spouse_data' ? 'primary_user_id' : 'user_id';
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(userColumn, user.id);
      
      if (error) {
        console.error(`Error fetching ${table}:`, error.message);
        return { table, data: null };
      }
      
      return { 
        table, 
        data: MULTI_RECORD_TABLES.includes(table) ? data : (data[0] || null) 
      };
    });
    
    const fetchResults = await Promise.all(fetchPromises);
    
    // Convert array of results to object
    const results = {};
    fetchResults.forEach(({ table, data }) => {
      if (data !== null) {
        results[table] = data;
      }
    });
    
    return results;
  };

  const fetchSidebarData = async () => {
    if (!supabase || !user) return;
    try {
      const results = await fetchAllUserData();
      if (!results) return;
      
      setSidebarData(results);
      if (results.life_events) {
        setLifeEvents(results.life_events);
      }
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
    if (e) e.preventDefault();
    setShowScenarios(false); // Close scenario view if open
    if (!user || !supabase) {
      setShowAuth(true);
      return;
    }

    try {
      const results = await fetchAllUserData();
      if (!results) return;
      
      setSidebarData(results);
      if (results.life_events) {
        setLifeEvents(results.life_events);
      }

      if (results.users || results.pension_pots) {
        const pots = Array.isArray(results.pension_pots) ? results.pension_pots[0] : results.pension_pots;
        const payload = {
          date_of_birth: results.users?.date_of_birth,
          planned_retirement_age: results.users?.retirement_age,
          total_pension_value: pots?.current_value,
          monthly_contribution: pots?.monthly_contribution,
          still_contributing: pots?.is_active,
          property_value: results.property?.current_value,
          total_debt: results.liabilities?.current_balance,
          state_pension_amount: results.state_pension?.estimated_annual_amount
        };

        if (payload.total_pension_value || payload.date_of_birth) {
          await calculateProjections(payload, results.life_events || []);
          setHasSavedData(true);
          if (messages.length === 0) {
            setMessages([{
              id: generateId(),
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

  // Build financial context for Claude when projections exist
  const buildFinancialContext = () => {
    if (!projections || projections.length === 0) return null;
    
    const currentAge = projections[0]?.age;
    const retirementProjection = projections.find(p => p.age === plannedRetirementAge);
    const statePensionStartProjection = projections.find(p => p.age === assumptions.statePensionAge);
    const finalProjection = projections[projections.length - 1];
    const depletedYear = projections.find(p => p.fundsDepleted);
    
    // Build key milestone summary
    const milestones = projections
      .filter((p, i) => 
        i === 0 || 
        p.age === plannedRetirementAge || 
        p.age === assumptions.statePensionAge ||
        i === projections.length - 1
      )
      .map(p => `Age ${p.age} (${p.year}): Pension £${p.pensionTotal.toLocaleString()}, Income £${p.totalIncome.toLocaleString()}/yr, Net Worth £${p.netWorth.toLocaleString()}`)
      .join('\n');
    
    // Existing life events summary
    const eventsText = lifeEvents.length > 0
      ? lifeEvents.map(e => `- ${e.event_name}: £${Math.abs(e.cost).toLocaleString()} ${e.cost > 0 ? 'expense' : 'windfall'} at age ${e.event_age}`).join('\n')
      : 'None yet';
    
    const depletionWarning = depletedYear 
      ? `⚠️ WARNING: Funds projected to deplete at age ${depletedYear.age} (${depletedYear.year})`
      : 'Funds projected to last through simulation period';
    
    return `[FINANCIAL CONTEXT - Use this to inform your responses, do not repeat verbatim]
Current Age: ${currentAge}
Planned Retirement Age: ${plannedRetirementAge}
State Pension Age: ${assumptions.statePensionAge}
Years Until Retirement: ${Math.max(0, plannedRetirementAge - currentAge)}

CURRENT FINANCIAL SNAPSHOT:
- Current Pension Pot: £${projections[0]?.pensionTotal.toLocaleString()}
- Annual Contribution: £${projections[0]?.pensionContribution.toLocaleString()}
- Current Net Worth: £${projections[0]?.netWorth.toLocaleString()}
- Phase: ${projections[0]?.phase}

AT RETIREMENT (Age ${plannedRetirementAge}):
- Projected Pension Pot: £${retirementProjection?.pensionTotal.toLocaleString() || 'N/A'}
- Tax-Free Lump Sum Available: £${retirementProjection ? Math.round(retirementProjection.pensionTotal * 0.25).toLocaleString() : 'N/A'}
- Remaining After Lump Sum: £${retirementProjection ? Math.round(retirementProjection.pensionTotal * 0.75).toLocaleString() : 'N/A'}

STATE PENSION (Age ${assumptions.statePensionAge}):
- Annual State Pension: £${statePensionStartProjection?.statePension.toLocaleString() || 'N/A'}

END OF PROJECTION (Age ${finalProjection?.age}):
- Final Pension Pot: £${finalProjection?.pensionTotal.toLocaleString()}
- Final Net Worth: £${finalProjection?.netWorth.toLocaleString()}
- ${depletionWarning}

KEY MILESTONES:
${milestones}

EXISTING LIFE EVENTS:
${eventsText}

PROJECTION WINDOW: Age ${currentAge} to Age ${finalProjection?.age}

When the user mentions a life event:
- Validate age is within ${currentAge} to ${finalProjection?.age}
- Reference specific pension/net worth values at the mentioned age
- Explain impact on retirement sustainability
[END CONTEXT]

`;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    if (!user) {
      setShowAuth(true);
      return;
    }

    const userMessage = { id: generateId(), role: 'user', content: inputText.trim() };
    setInputText('');
    setIsLoading(true);

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    logPrompt(userMessage.content);

    // Build messages for API - inject financial context if projections exist
    const financialContext = buildFinancialContext();
    const apiMessages = financialContext
      ? nextMessages.map((msg, index) => {
          // Prepend context to the latest user message only
          if (index === nextMessages.length - 1 && msg.role === 'user') {
            return { ...msg, content: financialContext + msg.content };
          }
          return msg;
        })
      : nextMessages;

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: apiMessages })
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
      
      const extracted = extractDataPayload(assistantText);
      const lifeEvent = extractLifeEvent(assistantText);

      if (lifeEvent) {
        persistLifeEventData(lifeEvent);
      }

      if (extracted) {
        persistUserData(extracted);
        persistPropertyData(extracted);
        persistStatePensionData(extracted);
        persistLiabilitiesData(extracted);
        persistPensionPotData(extracted);
        await calculateProjections(extracted, lifeEvents);
        fetchSidebarData();
        const summaryMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Perfect, we have all the data we need. Generating Simulation.',
        };
        setMessages((prev) => [...prev, summaryMessage]);
      } else {
        // Strip any <life_event> tags from the displayed message
        let displayText = assistantText;
        if (lifeEvent) {
          displayText = assistantText.replace(/<life_event>\s*[\s\S]*?\s*<\/life_event>/g, '').trim();
          // If no text remains after stripping, show a friendly message
          if (!displayText) {
            displayText = `Got it! I've added "${lifeEvent.event_name}" at age ${lifeEvent.event_age} to your simulation.`;
          }
        }
        
        const assistantMessage = { id: generateId(), role: 'assistant', content: displayText };
        setMessages((prev) => [...prev, assistantMessage]);
        
        // If we just added a life event but didn't have full data extraction, 
        // refresh projections if they're already showing
        if (lifeEvent && projections) {
          fetchSidebarData();
        }
      }
    } catch (error) {
      console.error('Error calling Claude API:', error);
      const errorMessage = `Error: ${error.message}. Please check your API key and try again.`;
      setMessages((prev) => [...prev, { id: generateId(), role: 'assistant', content: errorMessage }]);
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
    setShowScenarios(false);
  };

  // Handle retirement age change from draggable chart
  const handleRetirementAgeChange = async (newAge) => {
    if (!lastBaseData) return;
    
    // Update the base data with new retirement age
    const updatedData = {
      ...lastBaseData,
      planned_retirement_age: newAge
    };
    
    setPlannedRetirementAge(newAge);
    setLastBaseData(updatedData);
    
    // Recalculate projections with new retirement age
    await calculateProjections(updatedData, lifeEvents, assumptions);
  };

  // Handle assumption change
  const handleAssumptionChange = async (key, value) => {
    const newAssumptions = { ...assumptions, [key]: value };
    setAssumptions(newAssumptions);
    
    if (lastBaseData) {
      // Recalculate projections with new assumptions
      await calculateProjections(lastBaseData, lifeEvents, newAssumptions);
    }
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
          {user && hasSavedData && (
            <a href="#scenarios" onClick={(e) => { e.preventDefault(); setShowScenarios(true); }}>
              Scenario Modelling
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

      {showScenarios ? (
        <main className="main scenario-view">
          <div className="scenario-container">
            <div className="scenario-card">
              <div className="scenario-header">
                <h1>Scenario Modelling</h1>
                <button 
                  className="scenario-close" 
                  onClick={() => setShowScenarios(false)}
                >
                  ← Back to Dashboard
                </button>
    </div>
              <div className="scenario-content">
                <h2>Hello World</h2>
                <p>Scenario modelling feature coming soon...</p>
              </div>
            </div>
          </div>
        </main>
      ) : (
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
                    {/* Assumptions Section */}
                    <div className="sidebar-group">
                      <div 
                        className="sidebar-group-header clickable"
                        onClick={() => setExpandedAssumptions(!expandedAssumptions)}
                      >
                        Assumptions
                        <span className={`chevron ${expandedAssumptions ? 'expanded' : ''}`}></span>
                      </div>
                      {expandedAssumptions && (
                        <>
                          {/* Growth Rates */}
                          <div className="sidebar-section">
                            <div 
                              className={`sidebar-row-header ${expandedAssumptionGroups.growth ? 'expanded' : ''}`}
                              onClick={() => toggleAssumptionGroup('growth')}
                            >
                              <span>Growth Rates</span>
                              <span className="chevron"></span>
                            </div>
                            {expandedAssumptionGroups.growth && (
                              <div className="sidebar-row-details">
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Accumulation</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="15"
                                      value={assumptions.growthAccumulation}
                                      onChange={(e) => handleAssumptionChange('growthAccumulation', parseFloat(e.target.value) || 0)}
                                    />
                                    <span>%</span>
                                  </div>
                                </div>
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Drawdown</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="15"
                                      value={assumptions.growthDrawdown}
                                      onChange={(e) => handleAssumptionChange('growthDrawdown', parseFloat(e.target.value) || 0)}
                                    />
                                    <span>%</span>
                                  </div>
                                </div>
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Property</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="15"
                                      value={assumptions.propertyGrowth}
                                      onChange={(e) => handleAssumptionChange('propertyGrowth', parseFloat(e.target.value) || 0)}
                                    />
                                    <span>%</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* State Pension */}
                          <div className="sidebar-section">
                            <div 
                              className={`sidebar-row-header ${expandedAssumptionGroups.statePension ? 'expanded' : ''}`}
                              onClick={() => toggleAssumptionGroup('statePension')}
                            >
                              <span>State Pension</span>
                              <span className="chevron"></span>
                            </div>
                            {expandedAssumptionGroups.statePension && (
                              <div className="sidebar-row-details">
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Start Age</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      min="60"
                                      max="75"
                                      value={assumptions.statePensionAge}
                                      onChange={(e) => handleAssumptionChange('statePensionAge', parseInt(e.target.value) || 67)}
                                    />
                                  </div>
                                </div>
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Annual Amount</span>
                                  <div className="detail-input">
                                    <span>£</span>
                                    <input
                                      type="number"
                                      step="100"
                                      min="0"
                                      value={assumptions.fullStatePension}
                                      onChange={(e) => handleAssumptionChange('fullStatePension', parseInt(e.target.value) || 0)}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Other */}
                          <div className="sidebar-section">
                            <div 
                              className={`sidebar-row-header ${expandedAssumptionGroups.other ? 'expanded' : ''}`}
                              onClick={() => toggleAssumptionGroup('other')}
                            >
                              <span>Other</span>
                              <span className="chevron"></span>
                            </div>
                            {expandedAssumptionGroups.other && (
                              <div className="sidebar-row-details">
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Inflation</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="10"
                                      value={assumptions.inflation}
                                      onChange={(e) => handleAssumptionChange('inflation', parseFloat(e.target.value) || 0)}
                                    />
                                    <span>%</span>
                                  </div>
                                </div>
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Tax-Free Lump Sum</span>
                                  <div className="detail-input">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={assumptions.taxFreeLumpSum}
                                      onChange={(e) => handleAssumptionChange('taxFreeLumpSum', parseFloat(e.target.value) || 0)}
                                    />
                                    <span>%</span>
                                  </div>
                                </div>
                                <div className="sidebar-detail-item editable">
                                  <span className="detail-label">Planning Horizon</span>
                                  <div className="detail-input">
                                    <span>Age</span>
                                    <input
                                      type="number"
                                      min="70"
                                      max="100"
                                      value={assumptions.planningHorizon}
                                      onChange={(e) => handleAssumptionChange('planningHorizon', parseInt(e.target.value) || 90)}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Integrations Section */}
                    <div className="sidebar-group">
                      <div 
                        className="sidebar-group-header clickable"
                        onClick={() => setExpandedIntegrationsGroup(!expandedIntegrationsGroup)}
                      >
                        Integrations
                        <span className={`chevron ${expandedIntegrationsGroup ? 'expanded' : ''}`}></span>
                      </div>
                      {expandedIntegrationsGroup && (
                        <>
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
                                  <button className="connect-btn" onClick={(e) => e.stopPropagation()}>
                                    Connect
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Profile Section */}
                    <div className="sidebar-group">
                      <div 
                        className="sidebar-group-header clickable"
                        onClick={() => setExpandedProfileGroup(!expandedProfileGroup)}
                      >
                        Profile
                        <span className={`chevron ${expandedProfileGroup ? 'expanded' : ''}`}></span>
                      </div>
                      {expandedProfileGroup && (
                        <>
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
                                  {Array.isArray(sidebarData[table]) ? (
                                    sidebarData[table].length > 0 ? (
                                      sidebarData[table].map((record, index) => (
                                        <div key={index} className="sidebar-multi-record">
                                          {Object.entries(config.fields).map(([field, label]) => (
                                            <div key={field} className="sidebar-detail-item">
                                              <span className="detail-label">{label}</span>
                                              <span className="detail-value">{formatValue(record[field])}</span>
                                            </div>
                                          ))}
                                          {index < sidebarData[table].length - 1 && <hr className="record-divider" />}
                                        </div>
                                      ))
                                    ) : (
                                      <div className="sidebar-detail-item">
                                        <span className="detail-value italic">Empty</span>
                                      </div>
                                    )
                                  ) : (
                                    Object.entries(config.fields).map(([field, label]) => (
                                      <div key={field} className="sidebar-detail-item">
                                        <span className="detail-label">{label}</span>
                                        <span className="detail-value">
                                          {formatValue(sidebarData[table]?.[field])}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {projections && (
              <div className="projections-container">
                <div className="projections-card">
                  <div className="projections-header">
                    <h2 className="projections-title">Your Pension Breakdown</h2>
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
                      <div className="table-drag-hint">
                        Click any row between ages 55-75 to change your retirement age
                      </div>
                      <table className="projections-table">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>Age</th>
                            <th>Pension Pot</th>
                            <th>Growth</th>
                            <th>Contrib.</th>
                            <th>Drawdown</th>
                            <th>State Pension</th>
                            <th>Total Income</th>
                            <th>Tax</th>
                            <th>Net Income</th>
                            <th>Net Worth</th>
                            <th>Events</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projections.map((p, idx) => {
                            const isRetirementLine = p.age === plannedRetirementAge;
                            const isClickableForRetirement = p.age >= 55 && p.age <= 75;
                            return (
                            <tr 
                              key={p.year} 
                              className={`
                                ${p.phase === 'Retirement' ? 'retirement-row' : ''} 
                                ${isRetirementLine ? 'retirement-line-row' : ''} 
                                ${p.fundsDepleted ? 'depleted-row' : ''}
                                ${isClickableForRetirement ? 'clickable-row' : ''}
                              `}
                              onClick={() => isClickableForRetirement && p.age !== plannedRetirementAge && handleRetirementAgeChange(p.age)}
                              title={isClickableForRetirement ? `Click to set retirement at age ${p.age}` : ''}
                            >
                              <td>{p.year}</td>
                              <td className="age-cell">
                                {p.age ?? 'N/A'}
                                {isRetirementLine && <span className="retirement-marker">◀ Retire</span>}
                              </td>
                              <td className={p.fundsDepleted ? 'warning' : ''}>
                                £{p.pensionTotal.toLocaleString()}
                              </td>
                              <td className="growth-cell">
                                {p.investmentGrowth > 0 ? `+£${p.investmentGrowth.toLocaleString()}` : '—'}
                              </td>
                              <td>
                                {p.pensionContribution > 0 ? `+£${p.pensionContribution.toLocaleString()}` : '—'}
                              </td>
                              <td className="drawdown-cell">
                                {p.pensionDrawdown > 0 ? `-£${p.pensionDrawdown.toLocaleString()}` : '—'}
                              </td>
                              <td>
                                {p.statePension > 0 ? `£${p.statePension.toLocaleString()}` : '—'}
                              </td>
                              <td className="income-cell">
                                £{p.totalIncome.toLocaleString()}
                                {p.lumpSum > 0 && <span className="lump-sum-badge" title="Tax-free lump sum">+TFC</span>}
                              </td>
                              <td className="tax-cell">
                                £{p.taxes.toLocaleString()}
                              </td>
                              <td className={p.incomeShortfall > 0 ? 'warning' : 'net-income-cell'}>
                                £{p.netIncome.toLocaleString()}
                                {p.incomeShortfall > 0 && <span className="shortfall-badge" title={`Shortfall: £${p.incomeShortfall.toLocaleString()}`}>⚠️</span>}
                              </td>
                              <td className="net-worth-cell">
                                £{p.netWorth.toLocaleString()}
                              </td>
                              <td className="events-cell">
                                {p.lifeEvents ? (
                                  <span className={`event-badge ${p.lifeEventCost > 0 ? 'expense' : 'windfall'}`} title={`£${Math.abs(p.lifeEventCost).toLocaleString()}`}>
                                    {p.lifeEvents}
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : viewMode === 'chart' ? (
                    <>
                      <div className="projections-chart-wrapper">
                        <ProjectionChart 
                          data={projections} 
                          retirementAge={plannedRetirementAge} 
                          onRetirementAgeChange={handleRetirementAgeChange}
                        />
                      </div>
                      <div className="chart-legend-bottom">
                        <div className="legend-item">
                          <span className="dot pre-retirement"></span>
                          <span>Accumulation</span>
                        </div>
                        <div className="legend-item">
                          <span className="dot post-retirement"></span>
                          <span>Retirement</span>
                        </div>
                        <div className="legend-item">
                          <span className="dot depleted"></span>
                          <span>Depleted</span>
                        </div>
                        <div className="legend-item">
                          <span className="line income-line"></span>
                          <span>Income</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="projections-guidance-wrapper">
                      <div className="guidance-content">
                        <h3>Understanding Your 30-Year Projection</h3>
                        <p>This comprehensive simulation models your financial trajectory through accumulation, retirement, and drawdown phases using UK tax rules and pension regulations.</p>
                        
                        <div className="guidance-grid">
                          <div className="guidance-item">
                            <h4>Accumulation Phase</h4>
                            <p>While working, your pension grows at 5% annually (a balanced portfolio assumption). Your contributions are added each year until your planned retirement age.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Retirement & Tax-Free Cash</h4>
                            <p>At retirement, you can take 25% of your pension as a tax-free lump sum. The remaining 75% stays invested at a more conservative 4% growth rate during drawdown.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Income Calculation</h4>
                            <p>Your income in retirement combines State Pension (from age 67) and pension drawdown. Drawdown is calculated to meet your stated income needs, inflation-adjusted at 2.5% per year.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>UK Tax Bands</h4>
                            <p>Tax is calculated using 2024/25 bands: Personal Allowance £12,570, Basic Rate 20% (to £50,270), Higher Rate 40% (to £125,140), Additional Rate 45%. Personal Allowance tapers above £100k.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Property & Net Worth</h4>
                            <p>Property value grows at 3% annually. Your mortgage balance reduces over time. Net Worth = Pension Pot + Property Equity + Any Tax-Free Cash taken.</p>
                          </div>
                          
                          <div className="guidance-item">
                            <h4>Fund Depletion Warning</h4>
                            <p>If your pension pot runs out before age 90, rows turn red. This indicates you may need to adjust your income expectations, retirement age, or contribution strategy.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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
      )}

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
