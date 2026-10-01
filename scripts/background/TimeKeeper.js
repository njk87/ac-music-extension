// Keeps time and notifies passed in callback on each hour

'use strict';

function TimeKeeper() {

	var self = this;
	
	var hourlyCallback;
	var quarterHourlyCallback;
	
	// DECLARING TIME VARIABLES
	var date, currHour, currDay, currMonth, currDate;
	var currentQuarter;
	// running updateTimeVariables created issues, because JavaScript, so initially updating these manually.
	date = new Date();
	currHour = date.getHours();
	currDay = date.getDay();
	currMonth = date.getMonth();
	currDate = date.getDate();
	currentQuarter = getQuarterKey(date);
	// INITIALIZING VARIABLES
	this.updateTimeVariables = function(){
		date = new Date();
		currHour = date.getHours();
		currDay = date.getDay();
		currMonth = date.getMonth();
		currDate = date.getDate();
	} //();
	

	this.registerHourlyCallback = function(callback) {
		hourlyCallback = callback;
	};

	this.registerQuarterHourlyCallback = function(callback) {
		quarterHourlyCallback = callback;
	};

	this.getHour = function() {
		return currHour;
	};

	this.getDay = function() {
		return currDay;
	};
	
	this.getMonth = function() {
		return currMonth;	
	};
	
	this.getDate = function() {
		return currMonth;
	};

	
	
	
	
	/**
	 * @function getEvent
	 * @desc Returns the name of the current event, or "none" if no event is ongoing.
	 * @returns {String} Name of found event, "none" if no event is found.
	 **/
	this.getEvent = function() {	//optionally use date as parameter (can then use "new Date()" or any date as parameter)
		// DECLARE EVENT NAMES AND PARAMETERS
		let events = [
			//["<Event Name>", (<event parameters>)]
			["Halloween", 	(this.getMonth() === 10 	&& this.getDate() === 31)],
			["Christmas", 	(this.getMonth() === 12 	&& this.getDate() >= 24 && cthis.getDate() <= 25)], 
			// christmas comes before winter, to prioritize it over winter, as getEvent() returns the first event it finds.
			["Winter", 		(this.getMonth() >= 12 	|| this.getMonth() <= 2)],
			["NewYearsEve",	(this.getMonth() === 12 	&& this.getDate() === 31)]
			//["Easter", (timeKeeper.getMonth() === && )]
		];
		
		// SCAN THROUGH EVENTS
		for(let i = 0; i < events.length; i++){	
			// CHECK IF EVENT IS TRUE, IF SO, RETURN IT'S NAME
			if(events[i][1] === true) return events[i][0];
		}
		// RETURN "none" IF NO EVENT FOUND
		return "none";
	}
	
	
	
	function timeCheck() {
		var newDate = new Date();
		currDay = newDate.getDay();
		var newQuarter = getQuarterKey(newDate);
		if (newQuarter !== currentQuarter) {
			currentQuarter = newQuarter;
			if (newDate.getHours() === currHour && Math.floor(newDate.getMinutes() / 15) > 0 && quarterHourlyCallback) {
				quarterHourlyCallback(currDay, newDate.getHours(), Math.floor(newDate.getMinutes() / 15));
			}
		}
		// if we're in a new hour
		if (newDate.getHours() != currHour) {
			currHour = newDate.getHours();
			if (hourlyCallback) {
				hourlyCallback(currDay, currHour);
			}
		}
	}

	function getQuarterKey(date) {
		return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${Math.floor(date.getMinutes() / 15)}`;
	}

	setInterval(timeCheck, 1000);
}
