export function resolveComponentLabel(component, fallbackId) {
  if (!component) return fallbackId;
  return component.label
    || component.name
    || component.ref
    || component.tag
    || component.props?.tag
    || component.props?.name
    || component.cable?.tag
    || component.id
    || fallbackId;
}
