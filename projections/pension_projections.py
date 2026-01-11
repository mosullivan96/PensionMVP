"""
Pension Cash Flow and Net Worth Projections API

Flask API server that calculates retirement projections including:
- 30-year cash flow projections
- UK tax calculations (2024/25 bands)
- Life event modeling
- Pension drawdown calculations
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import math

app = Flask(__name__)
CORS(app)  # Allow requests from React frontend

# =============================================================================
# Configuration Constants - UK 2024/25 Tax Year
# =============================================================================

# Growth rates
GROWTH_RATE_ACCUMULATION = 0.05  # 5% growth while accumulating (more aggressive)
GROWTH_RATE_DRAWDOWN = 0.04      # 4% growth in retirement (more conservative)
INFLATION_RATE = 0.025           # 2.5% annual inflation (BoE target)
PROPERTY_GROWTH_RATE = 0.03     # 3% annual property growth

# State pension
STATE_PENSION_AGE = 67          # UK state pension age (born after 1960)
FULL_STATE_PENSION = 11502      # Full new state pension 2024/25

# UK Income Tax Bands 2024/25
PERSONAL_ALLOWANCE = 12570
BASIC_RATE_THRESHOLD = 50270
HIGHER_RATE_THRESHOLD = 125140
BASIC_TAX_RATE = 0.20
HIGHER_TAX_RATE = 0.40
ADDITIONAL_TAX_RATE = 0.45

# Pension rules
TAX_FREE_LUMP_SUM_RATE = 0.25   # 25% tax-free at crystallisation
DEFAULT_RETIREMENT_AGE = 67
PROJECTION_YEARS = 30           # Extended to 30 years for better planning


# =============================================================================
# UK Tax Calculation
# =============================================================================

def calculate_uk_tax(total_income: float) -> float:
    """
    Calculate UK income tax using 2024/25 tax bands.
    Includes personal allowance tapering above £100k.
    """
    if total_income <= PERSONAL_ALLOWANCE:
        return 0
    
    tax = 0
    remaining_income = total_income
    
    # Personal allowance tapering (£1 lost for every £2 over £100k)
    effective_allowance = PERSONAL_ALLOWANCE
    if total_income > 100000:
        effective_allowance = max(0, PERSONAL_ALLOWANCE - (total_income - 100000) / 2)
    
    remaining_income -= effective_allowance
    if remaining_income <= 0:
        return 0
    
    # Basic rate band (£12,571 to £50,270)
    basic_band = min(remaining_income, BASIC_RATE_THRESHOLD - PERSONAL_ALLOWANCE)
    if basic_band > 0:
        tax += basic_band * BASIC_TAX_RATE
        remaining_income -= basic_band
    
    # Higher rate band (£50,271 to £125,140)
    higher_band = min(remaining_income, HIGHER_RATE_THRESHOLD - BASIC_RATE_THRESHOLD)
    if higher_band > 0:
        tax += higher_band * HIGHER_TAX_RATE
        remaining_income -= higher_band
    
    # Additional rate (over £125,140)
    if remaining_income > 0:
        tax += remaining_income * ADDITIONAL_TAX_RATE
    
    return tax


# =============================================================================
# Age Calculation
# =============================================================================

def calculate_current_age(date_of_birth: str) -> Optional[int]:
    """Calculate current age from date of birth string (YYYY-MM-DD)."""
    if not date_of_birth:
        return None
    
    try:
        dob = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
        today = date.today()
        age = today.year - dob.year
        # Adjust if birthday hasn't occurred yet this year
        if (today.month, today.day) < (dob.month, dob.day):
            age -= 1
        return age
    except (ValueError, TypeError):
        return None


# =============================================================================
# Main Projection Calculation
# =============================================================================

def calculate_projections(data: Dict[str, Any], events: List[Dict[str, Any]] = None, assumptions: Dict[str, Any] = None) -> List[Dict[str, Any]]:
    """
    Calculate 30-year pension projections.
    
    Args:
        data: Dictionary containing user financial data:
            - date_of_birth: str (YYYY-MM-DD)
            - total_pension_value: float
            - monthly_contribution: float
            - property_value: float
            - total_debt: float
            - state_pension_amount: float
            - annual_income_needed: float
            - planned_retirement_age: int
            - lump_sum_taken: bool
            - still_contributing: bool
        events: List of life events with:
            - event_name: str
            - event_age: int
            - event_year: int
            - cost: float (positive = expense, negative = windfall)
        assumptions: Dictionary of configurable assumptions:
            - growth_accumulation: float (e.g., 0.05 for 5%)
            - growth_drawdown: float
            - inflation: float
            - state_pension_age: int
            - full_state_pension: float
            - tax_free_lump_sum: float
            - property_growth: float
            - planning_horizon: int
    
    Returns:
        List of yearly projection dictionaries
    """
    if events is None:
        events = []
    if assumptions is None:
        assumptions = {}
    
    # Get assumptions with defaults
    growth_accumulation = assumptions.get('growth_accumulation', GROWTH_RATE_ACCUMULATION)
    growth_drawdown = assumptions.get('growth_drawdown', GROWTH_RATE_DRAWDOWN)
    inflation_rate = assumptions.get('inflation', INFLATION_RATE)
    state_pension_age = assumptions.get('state_pension_age', STATE_PENSION_AGE)
    full_state_pension = assumptions.get('full_state_pension', FULL_STATE_PENSION)
    tax_free_lump_sum_rate = assumptions.get('tax_free_lump_sum', TAX_FREE_LUMP_SUM_RATE)
    property_growth_rate = assumptions.get('property_growth', PROPERTY_GROWTH_RATE)
    planning_horizon = assumptions.get('planning_horizon', 90)
    
    results = []
    current_year = datetime.now().year
    
    # Calculate current age
    current_age = calculate_current_age(data.get('date_of_birth'))
    
    # Base values
    pension_pot = float(data.get('total_pension_value') or 0)
    monthly_contribution = float(data.get('monthly_contribution') or 0)
    annual_contribution = monthly_contribution * 12
    property_value = float(data.get('property_value') or 0)
    mortgage_balance = float(data.get('total_debt') or 0)
    state_pension_base = float(data.get('state_pension_amount') or full_state_pension)
    annual_income_needed = float(data.get('annual_income_needed') or 25000)
    retirement_age = int(data.get('planned_retirement_age') or DEFAULT_RETIREMENT_AGE)
    lump_sum_taken = bool(data.get('lump_sum_taken', False))
    still_contributing = data.get('still_contributing', True)
    if still_contributing is None:
        still_contributing = True
    
    # Track cumulative values
    has_retired = False
    has_taken_lump_sum = lump_sum_taken
    tax_free_cash_received = 0
    cumulative_drawdown = 0
    funds_depleted = False
    depletion_age = None
    
    # Estimate mortgage monthly payment (assume 25 year mortgage, 4% rate)
    if mortgage_balance > 0:
        rate_monthly = 0.04 / 12
        n_payments = 300  # 25 years
        mortgage_monthly_payment = (mortgage_balance * rate_monthly) / (1 - math.pow(1 + rate_monthly, -n_payments))
    else:
        mortgage_monthly_payment = 0
    
    # Calculate projection years based on planning horizon
    projection_years = planning_horizon - current_age if current_age is not None else PROJECTION_YEARS
    projection_years = max(10, min(projection_years, 50))  # Cap between 10 and 50 years
    
    for i in range(projection_years + 1):
        year = current_year + i
        age = current_age + i if current_age is not None else None
        
        # Determine phase
        is_retired = age is not None and age >= retirement_age
        is_state_pension_age = age is not None and age >= state_pension_age
        just_retired = is_retired and not has_retired
        has_retired = is_retired
        
        # Growth rate depends on phase
        growth_rate = growth_drawdown if is_retired else growth_accumulation
        
        # Start of year pension value
        pension_start_of_year = pension_pot
        
        # Investment growth (applied to pension pot)
        investment_growth = 0
        if i > 0 and not funds_depleted:
            investment_growth = pension_pot * growth_rate
            pension_pot += investment_growth
        
        # Contributions (only if working and still contributing)
        year_contribution = 0
        if not is_retired and still_contributing:
            year_contribution = annual_contribution
            pension_pot += year_contribution
        
        # Tax-free lump sum at retirement (25%)
        lump_sum_this_year = 0
        if just_retired and not has_taken_lump_sum and pension_pot > 0:
            lump_sum_this_year = pension_pot * tax_free_lump_sum_rate
            pension_pot -= lump_sum_this_year
            tax_free_cash_received = lump_sum_this_year
            has_taken_lump_sum = True
        
        # State pension (inflation-adjusted, only after state pension age)
        state_pension_this_year = 0
        if is_state_pension_age:
            state_pension_this_year = state_pension_base * math.pow(1 + inflation_rate, i)
        
        # Calculate income needed (inflation-adjusted)
        income_needed_this_year = 0
        if is_retired:
            income_needed_this_year = annual_income_needed * math.pow(1 + inflation_rate, i)
        
        # Calculate drawdown needed from pension to meet income target
        pension_drawdown = 0
        income_shortfall = 0
        if is_retired and not funds_depleted:
            income_gap = max(0, income_needed_this_year - state_pension_this_year)
            if income_gap > 0:
                if pension_pot >= income_gap:
                    pension_drawdown = income_gap
                    pension_pot -= pension_drawdown
                    cumulative_drawdown += pension_drawdown
                else:
                    # Funds running low - take what's left
                    pension_drawdown = pension_pot
                    income_shortfall = income_gap - pension_pot
                    pension_pot = 0
                    funds_depleted = True
                    if depletion_age is None:
                        depletion_age = age
        
        # Apply Life Events
        life_event_cost = 0
        life_event_names = []
        if age is not None:
            for event in events:
                event_age = event.get('event_age')
                event_year = event.get('event_year')
                if (event_age is not None and int(event_age) == age) or \
                   (event_year is not None and int(event_year) == year):
                    cost = float(event.get('cost') or 0)
                    life_event_cost += cost
                    if event.get('event_name'):
                        life_event_names.append(event['event_name'])
        
        # Deduct life event costs (positive = expense, negative = windfall)
        if life_event_cost != 0:
            if life_event_cost > 0:
                # Expense - deduct from pension pot
                pension_pot = max(0, pension_pot - life_event_cost)
            else:
                # Windfall - add to pension pot
                pension_pot -= life_event_cost  # Negative cost = addition
        
        # Mortgage paydown (simple: ~30% of payment goes to principal)
        if mortgage_balance > 0:
            mortgage_balance = max(0, mortgage_balance - (mortgage_monthly_payment * 12 * 0.3))
        
        # Total income this year
        total_income = state_pension_this_year + pension_drawdown + lump_sum_this_year
        
        # Tax calculation (lump sum is tax-free, drawdown and state pension are taxable)
        taxable_income = state_pension_this_year + pension_drawdown
        tax_paid = calculate_uk_tax(taxable_income)
        
        # Net income after tax
        net_income = total_income - tax_paid
        
        # Property equity (value minus remaining mortgage)
        property_equity = 0
        if property_value > 0:
            property_equity = property_value * math.pow(1 + property_growth_rate, i) - mortgage_balance
        
        # Total net worth
        net_worth = pension_pot + property_equity + tax_free_cash_received
        
        results.append({
            'year': year,
            'age': age,
            'phase': 'Retirement' if is_retired else 'Accumulation',
            'pensionStart': round(pension_start_of_year),
            'pensionTotal': round(pension_pot),
            'pensionContribution': round(year_contribution),
            'investmentGrowth': round(investment_growth),
            'pensionDrawdown': round(pension_drawdown),
            'lumpSum': round(lump_sum_this_year),
            'statePension': round(state_pension_this_year),
            'totalIncome': round(total_income),
            'taxes': round(tax_paid),
            'netIncome': round(net_income),
            'incomeNeeded': round(income_needed_this_year),
            'incomeShortfall': round(income_shortfall),
            'propertyEquity': round(property_equity),
            'netWorth': round(net_worth),
            'lifeEvents': ', '.join(life_event_names) if life_event_names else None,
            'lifeEventCost': round(life_event_cost),
            'fundsDepleted': funds_depleted
        })
    
    return results


# =============================================================================
# API Endpoints
# =============================================================================

@app.route('/api/projections', methods=['POST'])
def projections_endpoint():
    """
    Calculate pension projections.
    
    Expected JSON body:
    {
        "data": {
            "date_of_birth": "1970-01-15",
            "total_pension_value": 450000,
            "monthly_contribution": 500,
            "property_value": 350000,
            "total_debt": 150000,
            "state_pension_amount": 11502,
            "annual_income_needed": 30000,
            "planned_retirement_age": 65,
            "lump_sum_taken": false,
            "still_contributing": true
        },
        "events": [
            {
                "event_name": "Holiday home purchase",
                "event_age": 70,
                "cost": 100000
            }
        ],
        "assumptions": {
            "growth_accumulation": 0.05,
            "growth_drawdown": 0.04,
            "inflation": 0.025,
            "state_pension_age": 67,
            "full_state_pension": 11502,
            "tax_free_lump_sum": 0.25,
            "property_growth": 0.03,
            "planning_horizon": 90
        }
    }
    """
    try:
        body = request.get_json()
        
        if not body or 'data' not in body:
            return jsonify({'error': 'Missing data in request body'}), 400
        
        data = body['data']
        events = body.get('events', [])
        custom_assumptions = body.get('assumptions', {})
        
        # Merge custom assumptions with defaults
        assumptions = {
            'growth_accumulation': custom_assumptions.get('growth_accumulation', GROWTH_RATE_ACCUMULATION),
            'growth_drawdown': custom_assumptions.get('growth_drawdown', GROWTH_RATE_DRAWDOWN),
            'inflation': custom_assumptions.get('inflation', INFLATION_RATE),
            'state_pension_age': custom_assumptions.get('state_pension_age', STATE_PENSION_AGE),
            'full_state_pension': custom_assumptions.get('full_state_pension', FULL_STATE_PENSION),
            'tax_free_lump_sum': custom_assumptions.get('tax_free_lump_sum', TAX_FREE_LUMP_SUM_RATE),
            'property_growth': custom_assumptions.get('property_growth', PROPERTY_GROWTH_RATE),
            'planning_horizon': custom_assumptions.get('planning_horizon', 90)
        }
        
        projections = calculate_projections(data, events, assumptions)
        
        return jsonify({
            'projections': projections,
            'assumptions': assumptions
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'pension-projections'})


# =============================================================================
# Run Server
# =============================================================================

if __name__ == '__main__':
    print("Starting Pension Projections API server on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=True)
