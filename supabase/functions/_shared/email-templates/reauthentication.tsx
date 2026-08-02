/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

const BRAND = 'Kroneel'

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="it" dir="ltr">
    <Head />
    <Preview>Il tuo codice di verifica {BRAND}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{BRAND}</Text>
        <Heading style={h1}>Conferma la tua identità</Heading>
        <Text style={text}>
          Usa il codice qui sotto per confermare la tua identità.
        </Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Il codice ha una validità limitata. Se non hai richiesto tu questa
          operazione, ignora questa email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '26px',
  fontWeight: 'bold' as const,
  letterSpacing: '4px',
  color: '#111111',
  margin: '0 0 30px',
}
const footer = {
  fontSize: '12px',
  color: '#9a9a9a',
  lineHeight: '1.6',
  margin: '34px 0 0',
}
