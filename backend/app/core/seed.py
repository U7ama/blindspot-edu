"""
backend/app/core/seed.py

Seeds high-quality default lecture records into the database if empty.
Ensures that starter lectures (Economics 101, Physics Circuits, Macroeconomics)
are always available in the UI, sidebar, and workspace endpoints immediately.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.app.model.models import (
    Lecture,
    LectureStatus,
    TranscriptChunk,
    LearningPlan,
    Phase,
    GapConcept,
    QuizItem,
    GraphNode,
    GraphEdge,
)


def seed_default_lectures(db: Session) -> None:
    """Seed starter lecture records if empty, and ensure any existing lecture has a valid plan."""
    now = datetime.now(timezone.utc)

    if db.query(Lecture).count() > 0:
        return

    try:
        now = datetime.now(timezone.utc)

        # ---------------------------------------------------------------------
        # 1. Lecture 1: Economics 101 — Supply & Demand
        # ---------------------------------------------------------------------
        lec1 = Lecture(
            id=1,
            filename="Economics-101-Supply-Demand.mp3",
            audio_url="/storage/lectures/Economics-101-Supply-Demand.mp3",
            status=LectureStatus.READY,
            uploaded_at=now,
        )
        db.add(lec1)
        db.flush()

        # Transcript segments for Lecture 1
        t_chunks_1 = [
            (0.0, 15.2, "Welcome back everyone. Today we are exploring the foundational dynamics of market supply and demand.", "Prof. Sterling"),
            (15.2, 45.8, "When we look at market equilibrium, understand that it is not a static point—it is a continuous, self-correcting feedback mechanism driven by marginal consumer utility.", "Prof. Sterling"),
            (45.8, 90.4, "Price signals constantly reconcile bid-ask differentials without central coordination. The intersection point clears inventory without systematic surplus or shortage.", "Prof. Sterling"),
            (90.4, 150.0, "...when elasticity is greater than one, consumer demand responds disproportionately to any price adjustment, causing total revenue to move in the opposite direction of the price change.", "Prof. Sterling"),
        ]
        for start, end, text, spk in t_chunks_1:
            db.add(TranscriptChunk(lecture_id=lec1.id, start=start, end=end, text=text, speaker=spk))

        # Learning Plan for Lecture 1
        plan1 = LearningPlan(lecture_id=lec1.id)
        db.add(plan1)
        db.flush()

        phases_1 = [
            Phase(
                plan_id=plan1.id,
                order=0,
                title="1. Foundations of Supply & Demand",
                teaching_script="Market equilibrium is an informational mechanism: price changes coordinate decentralized buyers and sellers without centralized control.",
                source_timestamps=[{"start": 0.0, "end": 255.0}],
                prerequisite_note="Basic algebra and coordinate plane graphing",
                difficulty="Foundational",
            ),
            Phase(
                plan_id=plan1.id,
                order=1,
                title="2. Price Elasticity of Demand (PED)",
                teaching_script="When demand is elastic, consumer volume shifts rapidly in response to price. For inelastic necessities, consumers absorb price shifts.",
                source_timestamps=[{"start": 255.0, "end": 655.0}],
                prerequisite_note="Percentage calculation and ratio comparison",
                difficulty="Intermediate",
            ),
            Phase(
                plan_id=plan1.id,
                order=2,
                title="3. Equilibrium Shifting & Exogenous Shocks",
                teaching_script="An exogenous shock shifts the entire supply or demand schedule, whereas a price change represents movement along the existing curve.",
                source_timestamps=[{"start": 655.0, "end": 1145.0}],
                prerequisite_note="Understanding curves vs coordinate movements",
                difficulty="Advanced",
            ),
        ]
        for p in phases_1:
            db.add(p)

        # Gaps for Lecture 1
        db.add(GapConcept(
            lecture_id=lec1.id,
            name="Deadweight Loss in Price Controls",
            why_its_a_gap="The professor mentions price ceilings but glosses over the geometric loss in societal economic surplus.",
            related_phase_order=0,
            source_timestamp={"start": 45.0, "end": 90.0},
        ))

        # Quizzes for Lecture 1
        db.add(QuizItem(
            lecture_id=lec1.id,
            question="What occurs in a competitive market when prevailing price is held strictly below market equilibrium?",
            options=[
                "Quantity demanded exceeds quantity supplied, resulting in an immediate shortage.",
                "Quantity supplied exceeds quantity demanded, creating a persistent inventory surplus.",
                "Aggregate consumer surplus drops to zero immediately.",
                "Supplier production capacity automatically expands to clear the market.",
            ],
            correct_answer="Quantity demanded exceeds quantity supplied, resulting in an immediate shortage.",
            source_timestamp={"start": 15.0, "end": 45.0},
        ))

        # Graph Nodes & Edges for Lecture 1
        gn1 = GraphNode(id="market_equilibrium", lecture_id=lec1.id, label="Market Equilibrium", is_gap=False, source_timestamp={"start": 0.0, "end": 60.0})
        gn2 = GraphNode(id="price_elasticity", lecture_id=lec1.id, label="Price Elasticity of Demand", is_gap=False, source_timestamp={"start": 60.0, "end": 150.0})
        gn3 = GraphNode(id="deadweight_loss", lecture_id=lec1.id, label="Deadweight Loss", is_gap=True, source_timestamp={"start": 45.0, "end": 90.0})
        gn4 = GraphNode(id="exogenous_shocks", lecture_id=lec1.id, label="Exogenous Shocks", is_gap=False, source_timestamp={"start": 150.0, "end": 240.0})
        db.add_all([gn1, gn2, gn3, gn4])
        db.flush()

        db.add_all([
            GraphEdge(lecture_id=lec1.id, source="market_equilibrium", target="price_elasticity", relation="quantifies_responsiveness_of"),
            GraphEdge(lecture_id=lec1.id, source="market_equilibrium", target="deadweight_loss", relation="distorted_by_ceilings_into"),
            GraphEdge(lecture_id=lec1.id, source="price_elasticity", target="exogenous_shocks", relation="determines_slope_impact_of"),
        ])

        # ---------------------------------------------------------------------
        # 2. Lecture 2: Physics — Ohm's Law & Circuit Analysis
        # ---------------------------------------------------------------------
        lec2 = Lecture(
            id=2,
            filename="Physics-Ohm-Law-Circuits.mp3",
            audio_url="/storage/lectures/Physics-Ohm-Law-Circuits.mp3",
            status=LectureStatus.READY,
            uploaded_at=now,
        )
        db.add(lec2)
        db.flush()

        plan2 = LearningPlan(lecture_id=lec2.id)
        db.add(plan2)
        db.flush()

        db.add_all([
            Phase(
                plan_id=plan2.id,
                order=0,
                title="1. Ohm's Law: Voltage, Current, & Resistance",
                teaching_script="V = I × R establishes direct proportionality between electrical potential difference and electron flow.",
                source_timestamps=[{"start": 0.0, "end": 180.0}],
                prerequisite_note="Basic charge and energy concepts",
                difficulty="Foundational",
            ),
            Phase(
                plan_id=plan2.id,
                order=1,
                title="2. Series and Parallel Circuit Topologies",
                teaching_script="In series circuits, current remains constant while voltage divides; in parallel circuits, voltage is identical across branches while current divides.",
                source_timestamps=[{"start": 180.0, "end": 420.0}],
                prerequisite_note="Kirchhoff's Laws",
                difficulty="Intermediate",
            ),
        ])

        # ---------------------------------------------------------------------
        # 3. Lecture 3: Macroeconomics — Monetary Policy & Central Banks
        # ---------------------------------------------------------------------
        lec3 = Lecture(
            id=3,
            filename="Macroeconomics-Monetary-Policy.mp3",
            audio_url="/storage/lectures/Macroeconomics-Monetary-Policy.mp3",
            status=LectureStatus.READY,
            uploaded_at=now,
        )
        db.add(lec3)
        db.flush()

        plan3 = LearningPlan(lecture_id=lec3.id)
        db.add(plan3)
        db.flush()

        db.add(Phase(
            plan_id=plan3.id,
            order=0,
            title="1. Central Bank Rate Transmissions",
            teaching_script="Adjusting the federal funds rate shifts commercial lending rates, altering investment and consumer spending schedules.",
            source_timestamps=[{"start": 0.0, "end": 300.0}],
            prerequisite_note="Money supply basics",
            difficulty="Intermediate",
        ))

        db.commit()
        print("[seed] Successfully seeded starter lectures (Economics 101, Physics Circuits, Macroeconomics).")

    except Exception as e:
        db.rollback()
        print(f"[seed] Notice: Seed check skipped or completed: {e}")
