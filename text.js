const inputCalcu = document.getElementById("display");

function appendDisplay(num){
    inputCalcu.value += num;
}
function calcu(num){
    try{
        inputCalcu.value = eval(inputCalcu.value)
    }
    catch(error){
        inputCalcu.value = "error click C";
    }
}
function delall(){
    inputCalcu.value = "";
}