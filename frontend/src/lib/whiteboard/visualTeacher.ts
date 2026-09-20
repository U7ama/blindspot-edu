/**
 * frontend/src/lib/whiteboard/visualTeacher.ts
 *
 * Automated pedagogical visual scene generator for Blindspot Edu.
 * Implements a strict 3-Zone Spatial Grid Layout that prevents accidental
 * box overlaps while supporting intentional layering (e.g. curve intersections,
 * shaded surplus regions, dashed coordinate projections, and card badges).
 */

import { CanvasObject } from './types';
import { FlowStep } from '../api';

export function generateWhiteboardScene(
  topic: string,
  explanation: string,
  flowSteps?: FlowStep[],
  analogy?: string,
  keyTakeaway?: string
): CanvasObject[] {
  const objects: CanvasObject[] = [];
  const now = Date.now();
  const lowerTopic = (topic || '').toLowerCase();
  const isMarketOrCurve =
    lowerTopic.includes('equilibrium') ||
    lowerTopic.includes('supply') ||
    lowerTopic.includes('demand') ||
    lowerTopic.includes('price') ||
    lowerTopic.includes('market') ||
    lowerTopic.includes('elasticity');

  // =========================================================================
  // ZONE 1: TOP HEADER BANNER (y: 30 -> 90, height: 60px)
  // =========================================================================
  objects.push({
    id: `hdr-card-${now}`,
    type: 'shape',
    authoredBy: 'ai',
    zIndex: 1,
    geometry: {
      x: 50,
      y: 30,
      width: 740,
      height: 60,
      subtype: 'card',
      borderRadius: 10,
    },
    style: {
      strokeColor: '#701a24',
      fillColor: 'rgba(112, 26, 36, 0.22)',
      strokeWidth: 1.5,
      opacity: 1,
    },
    createdAt: now,
  });

  objects.push({
    id: `hdr-txt-${now}`,
    type: 'text',
    authoredBy: 'ai',
    zIndex: 3,
    geometry: {
      x: 70,
      y: 42,
      text: `🎨 Visual Lesson: ${topic.replace(/^\d+\.\s*/, '') || 'Conceptual Breakdown'}`,
      width: 700,
      height: 20,
    },
    style: {
      strokeColor: '#f5f5f4',
      fontSize: 15,
      strokeWidth: 1,
      opacity: 1,
      fontFamily: 'sans-serif',
    },
    createdAt: now,
  });

  objects.push({
    id: `hdr-sub-${now}`,
    type: 'text',
    authoredBy: 'ai',
    zIndex: 3,
    geometry: {
      x: 70,
      y: 65,
      text: 'AI Whiteboard pedagogical demonstration with live interactive visual models',
      width: 700,
      height: 16,
    },
    style: {
      strokeColor: '#a8a29e',
      fontSize: 11,
      strokeWidth: 1,
      opacity: 0.9,
      fontFamily: 'sans-serif',
    },
    createdAt: now,
  });

  // =========================================================================
  // ZONE 2: MAIN VISUAL STAGE (y: 110 -> 390, height: 280px)
  // =========================================================================
  if (isMarketOrCurve) {
    // -------------------------------------------------------------
    // LEFT SUBZONE: COORDINATE AXES & CURVE INTERSECTIONS (x: 50 -> 430)
    // -------------------------------------------------------------
    const originX = 110;
    const originY = 360;
    const axisWidth = 280;
    const axisHeight = 210;

    // Layer 0: Shaded Consumer Surplus Background Region (Intentional Layering)
    objects.push({
      id: `cs-shade-${now}`,
      type: 'shape',
      authoredBy: 'ai',
      zIndex: 0,
      geometry: {
        x: originX + 10,
        y: originY - axisHeight + 35,
        width: 120,
        height: 70,
        subtype: 'rectangle',
        borderRadius: 4,
      },
      style: {
        strokeColor: 'rgba(56, 189, 248, 0.25)',
        fillColor: 'rgba(56, 189, 248, 0.12)',
        strokeWidth: 1,
        opacity: 0.8,
        strokeStyle: 'dashed',
      },
      createdAt: now,
    });

    objects.push({
      id: `cs-lbl-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 2,
      geometry: {
        x: originX + 22,
        y: originY - axisHeight + 60,
        text: 'Consumer Surplus',
      },
      style: {
        strokeColor: '#38bdf8',
        fontSize: 10,
        strokeWidth: 1,
        opacity: 0.9,
      },
      createdAt: now,
    });

    // Layer 1: Y-Axis (Price)
    objects.push({
      id: `axis-y-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        from: { x: originX, y: originY },
        to: { x: originX, y: originY - axisHeight },
        arrowheadEnd: true,
      },
      style: {
        strokeColor: '#d6d3d1',
        strokeWidth: 2,
        opacity: 0.95,
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-y-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: originX - 35,
        y: originY - axisHeight - 12,
        text: 'Price (P)',
      },
      style: {
        strokeColor: '#f5f5f4',
        fontSize: 12,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // Layer 1: X-Axis (Quantity)
    objects.push({
      id: `axis-x-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        from: { x: originX, y: originY },
        to: { x: originX + axisWidth, y: originY },
        arrowheadEnd: true,
      },
      style: {
        strokeColor: '#d6d3d1',
        strokeWidth: 2,
        opacity: 0.95,
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-x-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: originX + axisWidth + 8,
        y: originY - 6,
        text: 'Quantity (Q)',
      },
      style: {
        strokeColor: '#f5f5f4',
        fontSize: 12,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // Layer 2: Demand Curve (Downward Sloping)
    objects.push({
      id: `curve-d-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 2,
      geometry: {
        from: { x: originX + 25, y: originY - 175 },
        to: { x: originX + 240, y: originY - 25 },
        arrowheadEnd: false,
      },
      style: {
        strokeColor: '#38bdf8',
        strokeWidth: 3,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-d-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: originX + 246,
        y: originY - 32,
        text: 'Demand (D)',
      },
      style: {
        strokeColor: '#38bdf8',
        fontSize: 11,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // Layer 2: Supply Curve (Upward Sloping)
    objects.push({
      id: `curve-s-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 2,
      geometry: {
        from: { x: originX + 25, y: originY - 25 },
        to: { x: originX + 240, y: originY - 175 },
        arrowheadEnd: false,
      },
      style: {
        strokeColor: '#f43f5e',
        strokeWidth: 3,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-s-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: originX + 246,
        y: originY - 182,
        text: 'Supply (S)',
      },
      style: {
        strokeColor: '#f43f5e',
        fontSize: 11,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // Equilibrium Intersection Coordinates
    const eqX = originX + 132;
    const eqY = originY - 100;

    // Layer 1: Dashed coordinate projection lines to axes (Intentional Layering)
    objects.push({
      id: `eq-proj-p-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        from: { x: eqX, y: eqY },
        to: { x: originX, y: eqY },
        arrowheadEnd: false,
      },
      style: {
        strokeColor: '#fbbf24',
        strokeWidth: 1.5,
        opacity: 0.8,
        strokeStyle: 'dashed',
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-p-star-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: originX - 22,
        y: eqY - 6,
        text: 'P*',
      },
      style: {
        strokeColor: '#fbbf24',
        fontSize: 12,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `eq-proj-q-${now}`,
      type: 'arrow',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        from: { x: eqX, y: eqY },
        to: { x: eqX, y: originY },
        arrowheadEnd: false,
      },
      style: {
        strokeColor: '#fbbf24',
        strokeWidth: 1.5,
        opacity: 0.8,
        strokeStyle: 'dashed',
      },
      createdAt: now,
    });

    objects.push({
      id: `lbl-q-star-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: eqX - 8,
        y: originY + 8,
        text: 'Q*',
      },
      style: {
        strokeColor: '#fbbf24',
        fontSize: 12,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // Layer 3: Equilibrium Point Circle Node & Marker
    objects.push({
      id: `eq-pt-${now}`,
      type: 'shape',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: eqX - 7,
        y: eqY - 7,
        width: 14,
        height: 14,
        subtype: 'circle',
      },
      style: {
        strokeColor: '#fbbf24',
        fillColor: '#fbbf24',
        strokeWidth: 2,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `eq-txt-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: eqX + 12,
        y: eqY - 14,
        text: 'E* (Market Equilibrium)',
      },
      style: {
        strokeColor: '#fbbf24',
        fontSize: 11.5,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    // -------------------------------------------------------------
    // RIGHT SUBZONE: EXPLANATION & PEDAGOGICAL INSIGHT CARD (x: 460 -> 790)
    // -------------------------------------------------------------
    objects.push({
      id: `exp-card-${now}`,
      type: 'shape',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        x: 460,
        y: 120,
        width: 330,
        height: 255,
        subtype: 'card',
        borderRadius: 10,
      },
      style: {
        strokeColor: 'rgba(255, 255, 255, 0.1)',
        fillColor: 'rgba(23, 23, 23, 0.9)',
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-title-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 138,
        text: 'Core Equilibrium Mechanics',
        width: 290,
      },
      style: {
        strokeColor: '#f5f5f4',
        fontSize: 13,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b1-h-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 170,
        text: '1. Price as Informational Signal',
        width: 290,
      },
      style: {
        strokeColor: '#38bdf8',
        fontSize: 11.5,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b1-t-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 190,
        text: 'Prices balance decentralized buyers and sellers at the margin.',
        width: 290,
      },
      style: {
        strokeColor: '#a8a29e',
        fontSize: 10.5,
        strokeWidth: 1,
        opacity: 0.9,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b2-h-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 226,
        text: '2. Market Dis-equilibrium Clearing',
        width: 290,
      },
      style: {
        strokeColor: '#fbbf24',
        fontSize: 11.5,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b2-t-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 246,
        text: 'If P > P*: Excess supply forces discounts down to E*.',
        width: 290,
      },
      style: {
        strokeColor: '#a8a29e',
        fontSize: 10.5,
        strokeWidth: 1,
        opacity: 0.9,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b3-h-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 282,
        text: '3. Allocative Clearance & Efficiency',
        width: 290,
      },
      style: {
        strokeColor: '#34d399',
        fontSize: 11.5,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `exp-b3-t-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 480,
        y: 302,
        text: 'At E*, Quantity Supplied = Quantity Demanded with zero waste.',
        width: 290,
      },
      style: {
        strokeColor: '#a8a29e',
        fontSize: 10.5,
        strokeWidth: 1,
        opacity: 0.9,
      },
      createdAt: now,
    });
  } else {
    // -------------------------------------------------------------
    // SEQUENTIAL FLOWCHART CARDS (Guaranteed Spacing with Zero Overlap)
    // -------------------------------------------------------------
    const stepsToRender: FlowStep[] =
      flowSteps && flowSteps.length > 0
        ? flowSteps
        : [
            { step_number: 1, title: 'Foundational Baseline', detail: 'Identify current parameters and active system constraints.' },
            { step_number: 2, title: 'Transformation Rule', detail: 'Apply core governing principle to predict value shifts.' },
            { step_number: 3, title: 'System Resolution', detail: 'Check if stable outcome or equilibrium target is satisfied.' },
          ];

    const cardWidth = 215;
    const cardHeight = 180;
    const cardY = 125;
    const startX = 50;
    const gap = 47;

    stepsToRender.slice(0, 3).forEach((step, idx) => {
      const curX = startX + idx * (cardWidth + gap);

      // Card Container
      objects.push({
        id: `step-box-${idx}-${now}`,
        type: 'shape',
        authoredBy: 'ai',
        zIndex: 1,
        geometry: {
          x: curX,
          y: cardY,
          width: cardWidth,
          height: cardHeight,
          subtype: 'card',
          borderRadius: 10,
        },
        style: {
          strokeColor: idx === 0 ? '#38bdf8' : idx === 1 ? '#fbbf24' : '#34d399',
          fillColor: 'rgba(23, 23, 23, 0.88)',
          strokeWidth: 1.5,
          opacity: 1,
        },
        createdAt: now,
      });

      // Step Number Badge (Pinned inside card)
      objects.push({
        id: `step-num-${idx}-${now}`,
        type: 'text',
        authoredBy: 'ai',
        zIndex: 3,
        geometry: {
          x: curX + 16,
          y: cardY + 16,
          text: `STEP 0${step.step_number || idx + 1}`,
          width: cardWidth - 32,
        },
        style: {
          strokeColor: idx === 0 ? '#38bdf8' : idx === 1 ? '#fbbf24' : '#34d399',
          fontSize: 10,
          strokeWidth: 1,
          opacity: 1,
          fontFamily: 'monospace',
        },
        createdAt: now,
      });

      // Step Title
      objects.push({
        id: `step-title-${idx}-${now}`,
        type: 'text',
        authoredBy: 'ai',
        zIndex: 3,
        geometry: {
          x: curX + 16,
          y: cardY + 38,
          text: step.title,
          width: cardWidth - 32,
        },
        style: {
          strokeColor: '#f5f5f4',
          fontSize: 12,
          strokeWidth: 1,
          opacity: 1,
        },
        createdAt: now,
      });

      // Step Detail
      objects.push({
        id: `step-detail-${idx}-${now}`,
        type: 'text',
        authoredBy: 'ai',
        zIndex: 3,
        geometry: {
          x: curX + 16,
          y: cardY + 74,
          text: step.detail,
          width: cardWidth - 32,
        },
        style: {
          strokeColor: '#a8a29e',
          fontSize: 10.5,
          strokeWidth: 1,
          opacity: 0.9,
        },
        createdAt: now,
      });

      // Connecting Arrow to Next Step (Starts at right edge of current card and ends at left edge of next card)
      if (idx < Math.min(stepsToRender.length, 3) - 1) {
        objects.push({
          id: `step-arr-${idx}-${now}`,
          type: 'arrow',
          authoredBy: 'ai',
          zIndex: 2,
          geometry: {
            from: { x: curX + cardWidth + 4, y: cardY + cardHeight / 2 },
            to: { x: curX + cardWidth + gap - 4, y: cardY + cardHeight / 2 },
            arrowheadEnd: true,
          },
          style: {
            strokeColor: '#78716c',
            strokeWidth: 2,
            opacity: 0.9,
          },
          createdAt: now,
        });
      }
    });
  }

  // =========================================================================
  // ZONE 3: BOTTOM INTUITION & TAKEAWAY RIBBON (y: 410 -> 495, height: 85px)
  // Safely positioned below all chart axes (y=360) and cards (y=380) with zero overlap
  // =========================================================================
  if (keyTakeaway || analogy || explanation) {
    objects.push({
      id: `btm-card-${now}`,
      type: 'shape',
      authoredBy: 'ai',
      zIndex: 1,
      geometry: {
        x: 50,
        y: 410,
        width: 740,
        height: 85,
        subtype: 'card',
        borderRadius: 10,
      },
      style: {
        strokeColor: 'rgba(251, 191, 36, 0.4)',
        fillColor: 'rgba(251, 191, 36, 0.08)',
        strokeWidth: 1.2,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `btm-hdr-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 70,
        y: 424,
        text: '💡 Key Intuition & Rule of Thumb',
        width: 700,
      },
      style: {
        strokeColor: '#fbbf24',
        fontSize: 11.5,
        strokeWidth: 1,
        opacity: 1,
      },
      createdAt: now,
    });

    objects.push({
      id: `btm-txt-${now}`,
      type: 'text',
      authoredBy: 'ai',
      zIndex: 3,
      geometry: {
        x: 70,
        y: 446,
        text: analogy || keyTakeaway || explanation.slice(0, 240),
        width: 700,
      },
      style: {
        strokeColor: '#e7e5e4',
        fontSize: 11,
        strokeWidth: 1,
        opacity: 0.95,
      },
      createdAt: now,
    });
  }

  return objects;
}
