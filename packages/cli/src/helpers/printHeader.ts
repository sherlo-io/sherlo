import gradientString from 'gradient-string';

const color = {
  approved: '79E8A5',
  noChanges: '64B5F6',
  unreviewed: 'FF906C',
};

const header = `
             888                       888          
             888                       888          
             888                       888          
    .d8888b  888 8b.   .d88b.  .d88888 888  .d88b.  
    88K      888 "88b d8P  Y8b 888"    888 d88""88b 
    "Y8888b. 888  888 88888888 888     888 888  888 
         X88 888  888 Y8b.     888     888 Y88..88P 
     88888P' 888  888  "Y8888  888     888  "Y88P"

Make sure your mobile app looks perfect on every device
`;

function printHeader(): void {
  console.log(gradientString(color.unreviewed, color.approved, color.noChanges)(header));
}

export default printHeader;
