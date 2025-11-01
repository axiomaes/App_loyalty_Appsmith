export default {
  render(color, status) {
    const palette = {
      green:  '#10B981', // verde
      orange: '#F59E0B', // ámbar
      red:    '#EF4444', // rojo
      gray:   '#B57EDC', // sin plan
      none:   '#9CA3AF'
    };
    const labelMap = {
      active:   'Activo',
      expiring: 'Por vencer',
      expired:  'Vencido',
      none:     'Sin plan'
    };

    const dot = `<span style="
      display:inline-block;width:10px;height:10px;border-radius:50%;
      background:${palette[color] || palette.gray};
      margin-right:6px;vertical-align:middle;"></span>`;

    const label = labelMap[status] || '—';
    return `${dot}<span>${label}</span>`;
  }
}
