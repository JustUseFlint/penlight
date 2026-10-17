export interface Seq { title: string; topic: string; steps: string[] }
/** Hand-written ordering exercises for the Sequence Builder game (premade). */
export const SEQUENCES: Seq[] = [
  { title: 'Blood flow through the heart', topic: 'Cardiovascular', steps: ['Right atrium', 'Right ventricle', 'Pulmonary artery', 'Lungs', 'Left atrium', 'Left ventricle', 'Aorta'] },
  { title: 'Cardiac conduction pathway', topic: 'Cardiovascular', steps: ['SA node', 'AV node', 'Bundle of His', 'Bundle branches', 'Purkinje fibers'] },
  { title: 'The nursing process (ADPIE)', topic: 'Fundamentals', steps: ['Assessment', 'Diagnosis', 'Planning', 'Implementation', 'Evaluation'] },
  { title: 'Priority framework for urgent problems', topic: 'Prioritization', steps: ['Airway', 'Breathing', 'Circulation'] },
  { title: 'Maslow\'s hierarchy (base to top)', topic: 'Prioritization', steps: ['Physiological needs', 'Safety and security', 'Love and belonging', 'Esteem', 'Self-actualization'] },
  { title: 'The chain of infection', topic: 'Infection control', steps: ['Infectious agent', 'Reservoir', 'Portal of exit', 'Mode of transmission', 'Portal of entry', 'Susceptible host'] },
  { title: 'Wound healing phases', topic: 'Fundamentals', steps: ['Hemostasis', 'Inflammation', 'Proliferation', 'Maturation'] },
  { title: 'Order of an abdominal assessment', topic: 'Assessment', steps: ['Inspection', 'Auscultation', 'Percussion', 'Palpation'] },
  { title: 'Path of urine', topic: 'Anatomy & Physiology', steps: ['Kidney', 'Ureter', 'Bladder', 'Urethra'] },
  { title: 'Path of air to the alveoli', topic: 'Anatomy & Physiology', steps: ['Nose', 'Pharynx', 'Larynx', 'Trachea', 'Bronchi', 'Bronchioles', 'Alveoli'] },
  { title: 'Path of food through the digestive tract', topic: 'Anatomy & Physiology', steps: ['Mouth', 'Esophagus', 'Stomach', 'Small intestine', 'Large intestine', 'Rectum'] },
  { title: 'Putting on PPE', topic: 'Infection control', steps: ['Perform hand hygiene', 'Gown', 'Mask or respirator', 'Goggles or face shield', 'Gloves'] },
  { title: 'Removing PPE', topic: 'Infection control', steps: ['Gloves', 'Goggles or face shield', 'Gown', 'Mask or respirator', 'Perform hand hygiene'] },
  { title: 'Mixing regular and NPH insulin in one syringe', topic: 'Pharmacology', steps: ['Inject air into the NPH vial', 'Inject air into the regular vial', 'Draw up the regular insulin', 'Draw up the NPH insulin'] },
  { title: 'SBAR communication', topic: 'Communication', steps: ['Situation', 'Background', 'Assessment', 'Recommendation'] },
  { title: 'Adult basic life support (first steps)', topic: 'Emergencies', steps: ['Check that the scene is safe', 'Check responsiveness', 'Call for help and get an AED', 'Check pulse and breathing (up to 10 seconds)', 'Start chest compressions'] },
  { title: 'The scientific method', topic: 'Science', steps: ['Ask a question', 'Form a hypothesis', 'Run an experiment', 'Analyze the data', 'Draw a conclusion'] },
  { title: 'Phases of mitosis (PMAT)', topic: 'Science', steps: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'] },
  { title: 'Calculating a weight-based dose', topic: 'Dosage Calculation', steps: ['Convert the weight from pounds to kilograms', 'Multiply the weight by the ordered dose per kilogram', 'Divide the dose by the concentration', 'Check the answer for reasonableness'] },
];
