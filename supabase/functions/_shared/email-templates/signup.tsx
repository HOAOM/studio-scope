/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName?: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

const BRAND = 'Kroneel'

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="it" dir="ltr">
    <Head />
    <Preview>Conferma il tuo indirizzo email per {BRAND}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{BRAND}</Text>
        <Heading style={h1}>Conferma il tuo indirizzo email</Heading>
        <Text style={text}>
          Grazie per esserti registrato su{' '}
          <Link href={siteUrl} style={link}>
            <strong>{BRAND}</strong>
          </Link>
          .
        </Text>
        <Text style={text}>
          Conferma l'indirizzo {recipient} cliccando sul pulsante qui sotto.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Conferma email
        </Button>
        <Text style={footer}>
          Se non hai creato un account, puoi ignorare questa email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Helvetica, Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '520px' }
const brand = {
  fontSize: '13px',
  letterSpacing: '3px',
  textTransform: 'uppercase' as const,
  color: '#111111',
  margin: '0 0 28px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 600 as const,
  color: '#111111',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#4a4a4a',
  lineHeight: '1.6',
  margin: '0 0 22px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#111111',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '4px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '12px',
  color: '#9a9a9a',
  lineHeight: '1.6',
  margin: '34px 0 0',
}
