# Sistema de pedidos, ventas y reseñas verificadas

## Flujo

1. El comprador registra un correo y autoriza usar su nombre y correo para gestionar el pedido. Los datos de envío siguen pasando al chat de WhatsApp.
2. El sitio guarda una referencia con nombre, correo y estado `pending` en Supabase y abre WhatsApp con esa referencia.
3. En `https://beauty-care-landing.vercel.app/gestion.html`, la tienda introduce su clave privada y confirma los datos del pedido que recibió por WhatsApp.
4. Después de comprobar que la persona recibió y pagó el pedido contra entrega, marca el pedido como entregado. El sistema envía una invitación al correo guardado en ese pedido.
5. El enlace verifica el acceso al correo, vence en 14 días y admite una reseña por pedido. Las opiniones y el total de entregas se consultan desde Supabase para todos los visitantes.

El total público cuenta solo pedidos marcados como `delivered` en esta base de datos, tras verificar entrega y pago. No se agregan números ni opiniones inventados. El registro empieza en cero; pedidos históricos solo deben importarse si corresponden a ventas reales.

## Configuración inicial

1. Crea un proyecto gratuito de Supabase y ejecuta `database/schema.sql` una vez en su SQL Editor.
2. Crea una cuenta de Resend, verifica un dominio remitente y autoriza el remitente que usarán los correos de invitación. Sin un remitente verificado Resend no enviará correos a los compradores.
3. En el proyecto de Vercel, entra en **Settings → Environment Variables** y configura para Production (y Preview si lo necesitas):
   - `SUPABASE_URL`: URL del proyecto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave `service_role` del proyecto. Es secreta; no la publiques en GitHub, en el HTML ni en el navegador.
   - `RESEND_API_KEY`: clave secreta de Resend.
   - `REVIEW_FROM_EMAIL`: remitente verificado, por ejemplo `Beauty Care <pedidos@tu-dominio-verificado.com>`.
   - `ADMIN_TOKEN`: clave aleatoria larga, solo para entrar a la página privada de pedidos.
   - `SITE_URL`: `https://beauty-care-landing.vercel.app`.
4. En Vercel, haz **Redeploy** para aplicar las variables al despliegue.
5. Abre `/gestion.html`, pega `ADMIN_TOKEN` y confirma los pedidos desde el chat de WhatsApp. Al registrar la entrega se manda la invitación. Si Resend falla, el pedido queda entregado y el botón **Reenviar invitación** permite reintentar.

Las claves solo se configuran como variables de entorno en Vercel. No las pegues en un commit o en un chat. La gestión privada solo expone pedidos tras validar `ADMIN_TOKEN`; las tablas no conceden acceso al navegador.

## Alcance del contador

El contador se deriva del número de pedidos con estado `delivered`. Para pedidos contra entrega, usa ese estado solo después de verificar pago y entrega. Por ahora empieza a contar las ventas registradas después de activar el sistema. No representa ventas antiguas no importadas ni pedidos solamente solicitados o confirmados.
