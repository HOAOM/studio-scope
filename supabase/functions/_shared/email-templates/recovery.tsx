/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName?: string
  confirmationUrl: string
}

const BRAND = 'Kroneel'

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="it" dir="ltr">
    <Head />
    <Preview>Reimposta la password del tuo account {BRAND}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{BRAND}</Text>
        <Heading style={h1}>Reimposta la password</Heading>
        <Text style={text}>
          Abbiamo ricevuto una richiesta di reimpostazione della password per il
          tuo account {BRAND}. Clicca sul pulsante qui sotto per sceglierne una
          nuova.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reimposta password
        </Button>
        <Text style={footer}>
          Se non hai richiesto tu il reset, ignora questa email: la tua password
          resterà invariata.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
