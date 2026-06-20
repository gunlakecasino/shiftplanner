import type { Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";

/** Anchor the drag ghost's top-left at the pointer (ideal for compact label overlays). */
export const snapTopLeftToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;

  const activatorCoordinates = getEventCoordinates(activatorEvent);
  if (!activatorCoordinates) return transform;

  const offsetX = activatorCoordinates.x - draggingNodeRect.left;
  const offsetY = activatorCoordinates.y - draggingNodeRect.top;

  return {
    ...transform,
    x: transform.x + offsetX,
    y: transform.y + offsetY,
  };
};

/** Adjust overlay for ancestor scale (used in relaxed builder on Safari/iPad).
 *  The visual content is scaled, but ghost is portaled; adjust the applied transform
 *  so the ghost follows correctly in screen space.
 */
export const adjustForContentScale = (scale: number): Modifier => ({ transform }) => {
  if (scale === 1 || !transform) return transform;
  // Since rects from getBoundingClientRect are already post-scale (visual),
  // we divide the movement delta by scale to keep ghost in correct visual relation.
  return {
    ...transform,
    x: transform.x / scale,
    y: transform.y / scale,
  };
};