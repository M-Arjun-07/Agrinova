const fetch = require('node-fetch'); // if using Node.js <18, install via npm i node-fetch@2

async function postSave() {
  try {
    const response = await fetch('http://localhost:3000/saves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        save_name: 'Test Farm',
        soil_type: 'alluvial',
        crop_type: 'rice',
        choices: {
          fertilizer: 'organic',
          irrigation: 'drip',
          pest_control: 'natural'
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Failed to create save:', data);
    } else {
      console.log('Save created successfully:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

postSave();
