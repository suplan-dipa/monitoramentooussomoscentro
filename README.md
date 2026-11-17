# Monitoramento · OUS Somos Centro (protótipo)

Site estático do protótipo de monitoramento da Operação Urbana Simplificada Somos Centro (Lei nº 12.151/2026, Belo Horizonte).

- `index.html`: indicadores núcleo M01–M10, por trimestre e acumulado. **Os valores são fictícios.**
- `mapa.html`: mapa 3D com o relevo (MDT reconstruído), as edificações existentes e os empreendimentos licenciados,
  com vista do observador (nível da rua, céu e horizonte 360°, trajetória do sol).

O mapa consulta em tempo real os serviços WMS/WFS da IDE BHGEO (bhmap.pbh.gov.br). Se eles estiverem fora do ar,
o mapa base, a hipsometria e as edificações não aparecem. Os envelopes enviados pelo usuário ficam só no navegador dele.

Publicado a partir de `publicar/` em 17/11/2026.
