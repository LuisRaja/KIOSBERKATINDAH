const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function sendOrderNotification(order, items) {
  return new Promise((resolve) => {
    const transporter = getTransporter();
    if (!transporter) {
      return resolve(false);
    }

    const itemsHtml = items.map((item, i) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.product_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">Rp ${Number(item.product_price).toLocaleString('id-ID')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">Rp ${Number(item.subtotal).toLocaleString('id-ID')}</td>
      </tr>`
    ).join('');

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#4A0E17;padding:20px;text-align:center;border-radius:12px 12px 0 0">
          <h1 style="color:#DDA15E;margin:0;font-size:22px">Kios Berkat Indah</h1>
          <p style="color:#fff;margin:4px 0 0">Pesanan Baru Masuk!</p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #eee;border-top:0">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px">
            <p style="margin:0;font-size:14px;color:#166534"><strong>No. Pesanan:</strong> ${order.order_number}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#166534"><strong>Total:</strong> Rp ${Number(order.total).toLocaleString('id-ID')}</p>
          </div>

          <h3 style="color:#4A0E17;font-size:14px;margin:0 0 8px">Data Pemesan</h3>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#666">Nama</td><td style="padding:4px 0"><strong>${order.customer_name}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#666">Telepon</td><td style="padding:4px 0"><strong>${order.customer_phone}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#666">Ambil</td><td style="padding:4px 0"><strong>${order.pickup_date} ${order.pickup_time}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#666">Metode</td><td style="padding:4px 0"><strong>${order.shipping_method}</strong></td></tr>
            ${order.notes ? `<tr><td style="padding:4px 0;color:#666">Catatan</td><td style="padding:4px 0"><strong>${order.notes}</strong></td></tr>` : ''}
          </table>

          <h3 style="color:#4A0E17;font-size:14px;margin:16px 0 8px">Item Pesanan</h3>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <thead>
              <tr style="background:#f9f9f9">
                <th style="padding:8px 12px;text-align:center">No</th>
                <th style="padding:8px 12px;text-align:left">Produk</th>
                <th style="padding:8px 12px;text-align:center">Qty</th>
                <th style="padding:8px 12px;text-align:right">Harga</th>
                <th style="padding:8px 12px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="border-top:2px solid #4A0E17;margin-top:12px;padding-top:8px;text-align:right;font-size:16px;font-weight:bold;color:#4A0E17">
            Total: Rp ${Number(order.total).toLocaleString('id-ID')}
          </div>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="font-size:12px;color:#999;text-align:center">
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/orders" style="color:#4A0E17">Buka Admin Panel</a>
            &mdash; Kios Berkat Indah
          </p>
        </div>
      </div>
    `;

    const to = process.env.EMAIL_TO || process.env.EMAIL_USER;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: `Pesanan Baru: ${order.order_number} - Rp ${Number(order.total).toLocaleString('id-ID')}`,
      html,
    }).then(() => resolve(true)).catch(() => resolve(false));
  });
}

function sendPaymentProofNotification(order, proofPath) {
  return new Promise((resolve) => {
    const transporter = getTransporter();
    if (!transporter) {
      return resolve(false);
    }

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#4A0E17;padding:20px;text-align:center;border-radius:12px 12px 0 0">
          <h1 style="color:#DDA15E;margin:0;font-size:22px">Kios Berkat Indah</h1>
          <p style="color:#fff;margin:4px 0 0">Bukti Pembayaran Masuk!</p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #eee;border-top:0">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px">
            <p style="margin:0;font-size:14px;color:#166534"><strong>No. Pesanan:</strong> ${order.order_number}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#166534"><strong>Total:</strong> Rp ${Number(order.total).toLocaleString('id-ID')}</p>
          </div>

          <h3 style="color:#4A0E17;font-size:14px;margin:0 0 8px">Data Pemesan</h3>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#666">Nama</td><td style="padding:4px 0"><strong>${order.customer_name}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#666">Telepon</td><td style="padding:4px 0"><strong>${order.customer_phone}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#666">Ambil</td><td style="padding:4px 0"><strong>${order.pickup_date} ${order.pickup_time}</strong></td></tr>
          </table>

          <p style="font-size:13px;color:#333;margin-top:16px">Bukti pembayaran terlampir di email ini.</p>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="font-size:12px;color:#999;text-align:center">
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/orders" style="color:#4A0E17">Buka Admin Panel</a>
            &mdash; Kios Berkat Indah
          </p>
        </div>
      </div>
    `;

    const to = process.env.EMAIL_TO || process.env.EMAIL_USER;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: `Bukti Bayar: ${order.order_number} - Rp ${Number(order.total).toLocaleString('id-ID')}`,
      html,
      attachments: [{
        filename: 'bukti-bayar-' + order.order_number + '.png',
        path: proofPath,
        cid: 'payment-proof'
      }]
    }).then(() => resolve(true)).catch(() => resolve(false));
  });
}

module.exports = { sendOrderNotification, sendPaymentProofNotification };
