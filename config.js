/* Réglages du site So Creativ’Nails : seul fichier à modifier pour brancher l'agenda et le paiement.
   Voir RESERVATION-AGENDA.md (agenda Google via Make) et worker/README.md (paiement Stripe).
   Les prestations, durées, horaires et règles d'acompte sont dans data/prestations.json (puis python3 outils/generer-donnees.py).
   Vérification : node outils/verifier-donnees.mjs */
window.SCN_CFG = {
  /* true = démonstration : créneaux d'exemple, aucun paiement réel, aucune demande envoyée. */
  DEMO_MODE: true,

  /* Agenda (Make → Google Agenda de Sophie). Contrat décrit dans RESERVATION-AGENDA.md. */
  BOOKING_WEBHOOK: '',      // reçoit le rendez-vous (POST JSON) et crée l'événement horaire
  AVAILABILITY_URL: '',     // renvoie les créneaux déjà pris (GET ?from=AAAA-MM-JJ&to=AAAA-MM-JJ)

  /* Paiement.
     'demo'   : simulation claire, aucune carte demandée (état actuel)
     'stripe' : redirection vers Stripe Checkout via le Worker Cloudflare (worker/checkout.js)
     'none'   : pas de paiement en ligne, la demande est envoyée à l'agenda et l'acompte se règle à l'onglerie */
  PAYMENT_MODE: 'demo',
  CHECKOUT_ENDPOINT: '',    // ex. https://so-creativ-nails-paiement.<compte>.workers.dev/checkout

  /* Réservation : créneaux toutes les 30 minutes, délai minimum de 12 h, planning ouvert 90 jours.
     MAX_TOTAL_MIN = la plus longue plage d'ouverture (3 h) : un rendez-vous ne passe jamais la pause de midi. */
  MIN_NOTICE_HOURS: 12,
  MAX_DAYS_AHEAD: 90,
  SLOT_STEP_MIN: 30,
  MAX_TOTAL_MIN: 180,

  /* Onglerie */
  PHONE_DISPLAY: '04 92 73 08 66',
  PHONE_TEL: '+33492730866',
  ADDRESS: '260 avenue Régis Ryckebusch, 04100 Manosque',
  LAT: 43.8306215,
  LNG: 5.7977633,
  OWNER: 'Sophie',
  BRAND: 'So Creativ’Nails'
};
