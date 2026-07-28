import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined in environment variables');
    }
    this.resend = new Resend(apiKey);
  }

  async sendPasswordResetEmail(to: string, resetLink: string) {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      throw new Error('RESEND_FROM_EMAIL is not defined in environment variables');
    }

    const expiresMinutes = process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? '30';

    await this.resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Reset your password',
      html: this.buildResetEmailHtml(resetLink, expiresMinutes),
    });
  }

  private buildResetEmailHtml(resetLink: string, expiresMinutes: string): string {
    return `
   <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Reset Your Password — NORSU Building and Grounds</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing:antialiased;">

  <!-- Outer Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8; padding: 40px 16px;">
    <tr>
      <td align="center">

        <!-- Main Card -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06); max-width:520px; width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0078d4; padding:40px 32px 36px; text-align:center;">
              <img src="${process.env.LOGO_URL}"
                   alt="NORSU Logo"
                   width="56"
                   height="56"
                   style="display:block; margin:0 auto 12px; border:0;" />
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:-0.3px;">
                NORSU Building and Grounds
              </h1>
              <p style="margin:6px 0 0; color:rgba(255,255,255,0.8); font-size:13px;">
                Inventory & Maintenance System
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 36px 32px;">

              <!-- Title -->
              <h2 style="margin:0 0 20px; color:#0f172a; font-size:20px; font-weight:700; letter-spacing:-0.2px;">
                Reset your password
              </h2>

              <p style="margin:0 0 28px; color:#475569; font-size:15px; line-height:1.7;">
                We received a request to reset the password for your account. Click the button below to securely choose a new password.
              </p>

              <!-- Expiry Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px; background-color:#e6f2fb; border-left:4px solid #0078d4; border-radius:6px; width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0; color:#005a9e; font-size:13px; font-weight:600;">
                      This link expires in <strong>${expiresMinutes} minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="border-radius:8px; background-color:#0078d4; box-shadow:0 2px 8px rgba(0,120,212,0.25);">
                    <a href="${resetLink}"
                       style="display:inline-block; padding:14px 36px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; border-radius:8px;">
                      Reset Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-top:1px solid #e2e8f0; font-size:0; line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin:0 0 8px; color:#94a3b8; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">
                Or copy and paste this link
              </p>
              <p style="margin:0 0 24px; padding:12px 14px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; color:#475569; font-size:13px; line-height:1.6; word-break:break-all; font-family:'SF Mono', Monaco, monospace;">
                ${resetLink}
              </p>

              <!-- Security Notice -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8; border-radius:8px; width:100%;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 6px; color:#334155; font-size:13px; font-weight:600;">
                      Didn't request this?
                    </p>
                    <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                      If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged and your account is secure.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc; padding:24px 36px; text-align:center; border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 6px; color:#64748b; font-size:13px; font-weight:600;">
                Negros Oriental State University
              </p>
              <p style="margin:0 0 12px; color:#94a3b8; font-size:12px;">
                Building & Grounds — Inventory & Maintenance System
              </p>
              <p style="margin:0; color:#cbd5e1; font-size:11px;">
                &copy; ${new Date().getFullYear()} NORSU. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; width:100%; margin-top:16px;">
          <tr>
            <td align="center" style="padding:0 16px;">
              <p style="margin:0; color:#94a3b8; font-size:11px; line-height:1.5;">
                This email was sent from an automated system. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `;
  }
}