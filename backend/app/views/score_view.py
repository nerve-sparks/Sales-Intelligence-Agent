from app.models import LeadScore


def serialize_lead_score(score: LeadScore) -> dict:
    return {
        "lead_score_id": str(score.lead_score_id),
        "company_id": str(score.company_id),
        "gate_check_1": score.gate_check_1,
        "gate_check_2": score.gate_check_2,
        "gate_check_3": score.gate_check_3,
        "gate_check_4": score.gate_check_4,
        "gate_check_5": score.gate_check_5,
        "gate_passed": score.gate_passed,
        "gate_status": score.gate_status,
        "d1_pain_acuity": float(score.d1_pain_acuity) if score.d1_pain_acuity is not None else None,
        "d2_ai_intent": float(score.d2_ai_intent) if score.d2_ai_intent is not None else None,
        "d3_economic_capacity": float(score.d3_economic_capacity) if score.d3_economic_capacity is not None else None,
        "d4_authority": float(score.d4_authority) if score.d4_authority is not None else None,
        "d5_timing_catalyst": float(score.d5_timing_catalyst) if score.d5_timing_catalyst is not None else None,
        "d6_solution_fit": float(score.d6_solution_fit) if score.d6_solution_fit is not None else None,
        "d7_competitive": float(score.d7_competitive) if score.d7_competitive is not None else None,
        "component_score": float(score.component_score) if score.component_score is not None else None,
        "p_convert": float(score.p_convert) if score.p_convert is not None else None,
        "expected_deal_value_usd": float(score.expected_deal_value_usd) if score.expected_deal_value_usd is not None else None,
        "lead_score": float(score.lead_score) if score.lead_score is not None else None,
        "scored_at": score.scored_at,
    }


def serialize_ranked_lead_score(row) -> dict:
    return {
        "company_name": row.company_name,
        "lead_score": float(row.lead_score) if row.lead_score is not None else None,
        "component_score": float(row.component_score) if row.component_score is not None else None,
        "gate_status": row.gate_status,
    }
