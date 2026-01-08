"""
Pension Cash Flow and Net Worth Projections

This module fetches user data from Supabase and generates retirement projections
including cash flow analysis and net worth projections over time.
"""

import os
from datetime import datetime, date
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("REACT_APP_SUPABASE_URL")
SUPABASE_KEY = os.getenv("REACT_APP_SUPABASE_KEY")


@dataclass
class UserProfile:
    """User demographic and preference data."""
    user_id: str
    email: str
    date_of_birth: Optional[date] = None
    retirement_age: Optional[int] = None
    inflation_assumption: float = 2.5
    investment_return_assumption: float = 5.0


@dataclass
class PensionPot:
    """Defined contribution pension pot data."""
    pot_id: str
    user_id: str
    provider_name: Optional[str] = None
    pot_type: Optional[str] = None
    current_value: float = 0.0
    monthly_contribution: Optional[float] = None
    is_active: bool = False


@dataclass
class StatePension:
    """State pension entitlement data."""
    user_id: str
    estimated_annual_amount: Optional[float] = None
    state_pension_age: int = 67  # Default UK state pension age


@dataclass
class Property:
    """Property asset data."""
    user_id: str
    current_value: float = 0.0
    has_mortgage: bool = False
    mortgage_balance: Optional[float] = None


@dataclass
class Liability:
    """Debt/liability data."""
    user_id: str
    liability_type: Optional[str] = None
    current_balance: float = 0.0


@dataclass
class ProjectionYear:
    """Single year projection results."""
    year: int
    pension_pot_value: float
    cash_income: float
    taxes: float
    net_worth: float


class SupabaseClient:
    """Handles all Supabase database operations."""
    
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Supabase credentials not found in environment variables")
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    def get_user_data(self, user_id: str):
        """Fetch all data for a user and return a combined projection."""
        # This mirrors the logic in App.js
        user = self.client.table("users").select("*").eq("user_id", user_id).execute().data
        pots = self.client.table("pension_pots").select("*").eq("user_id", user_id).execute().data
        state = self.client.table("state_pension").select("*").eq("user_id", user_id).execute().data
        prop = self.client.table("property").select("*").eq("user_id", user_id).execute().data
        liab = self.client.table("liabilities").select("*").eq("user_id", user_id).execute().data
        
        return {
            "user": user[0] if user else {},
            "pots": pots[0] if pots else {},
            "state": state[0] if state else {},
            "property": prop[0] if prop else {},
            "liabilities": liab[0] if liab else {}
        }


def run_10_year_projection(user_id: str):
    db = SupabaseClient()
    data = db.get_user_data(user_id)
    
    years = 10
    current_year = datetime.now().year
    growth_rate = 0.05
    inflation_rate = 0.025
    
    current_pension = float(data["pots"].get("current_value") or 0)
    monthly_contrib = float(data["pots"].get("monthly_contribution") or 0)
    annual_contrib = monthly_contrib * 12
    property_val = float(data["property"].get("current_value") or 0)
    total_debt = float(data["liabilities"].get("current_balance") or 0)
    state_pension = float(data["state"].get("estimated_annual_amount") or 0)
    
    print(f"\n10-Year Projection for User: {user_id}")
    print("-" * 80)
    print(f"{'Year':<6} {'Pension':<15} {'Net Worth':<15} {'Cash Income':<15} {'Est. Taxes':<15}")
    print("-" * 80)
    
    for i in range(years + 1):
        year = current_year + i
        if i > 0:
            current_pension = current_pension * (1 + growth_rate) + annual_contrib
            
        net_worth = current_pension + property_val - total_debt
        cash_income = state_pension * ((1 + inflation_rate) ** i)
        
        # Simple tax: 20% above 12570
        taxable = max(0, cash_income - 12570)
        est_tax = taxable * 0.2
        
        print(f"{year:<6} £{current_pension:>13,.0f} £{net_worth:>13,.0f} £{cash_income:>13,.0f} £{est_tax:>13,.0f}")
    
    print("-" * 80)
    print("Assumptions:")
    print("- Growth: 5%, Inflation: 2.5%")
    print("- No drawdown/annuity products purchased yet")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        run_10_year_projection(sys.argv[1])
    else:
        print("Please provide a user_id")
