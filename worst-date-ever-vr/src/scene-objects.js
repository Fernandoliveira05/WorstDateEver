export function objectGroup(THREE, parent, name) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  return group;
}

export function organizeBedroomObjects(THREE, root, data) {
  const model = root.children.find(child => child.children.some(node => node.name === data.phone.id)) ?? root;
  const groups = Object.fromEntries([
    'Static bedroom meshes', 'Neighborhood meshes', 'Exterior effects', 'Door and drawers',
    'Loose props', 'Clothing and bedding', 'Phone and preparation', 'Window and mirror'
  ].map(name => [name, objectGroup(THREE, model, name)]));
  const movers = new Set([data.door.id, data.door.handle, ...data.drawers.map(item => item.id),
    ...data.pulls.map(item => item.id)]);
  const textiles = new Set([...data.soft, ...data.garments].flatMap(item => [item.core, item.id,
    ...(item.ends ?? []), ...(item.bones ?? [])]));
  const prep = new Set([data.phone.id, data.monitor,
    ...data.props.filter(prop => prop.PreparationItem).map(prop => prop.id)]);
  const windows = new Set([data.mirror, ...data.curtains, ...data.window.panes]);
  const props = new Set(data.props.map(item => item.id));
  const street = new Set([...data.cars.flatMap(item => [item.id, ...(item.wheels ?? [])]),
    ...data.signals.flat()]);
  const effects = new Set([data.window.sky, ...data.window.clouds, ...data.window.mountains,
    ...data.window.birds, ...data.window.beams, ...data.window.fixtures]);
  const destinations = new Set(Object.values(groups));
  for (const object of [...model.children]) {
    if (destinations.has(object)) continue;
    const id = object.name;
    const category = movers.has(id) ? 'Door and drawers'
      : prep.has(id) ? 'Phone and preparation'
      : windows.has(id) ? 'Window and mirror'
      : textiles.has(id) ? 'Clothing and bedding'
      : props.has(id) ? 'Loose props'
      : (data.specials[id] || effects.has(id)) ? 'Exterior effects'
      : id.startsWith('street_') || street.has(id) ? 'Neighborhood meshes'
      : 'Static bedroom meshes';
    groups[category].add(object);
  }
}
